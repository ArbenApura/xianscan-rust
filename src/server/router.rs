use std::sync::{Arc, Mutex};
use axum::{
    extract::{DefaultBodyLimit, Multipart, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use tower_http::cors::{Any, CorsLayer};
use rayon::prelude::*;

use crate::ml::device::{get_hardware_status, set_active_provider};
use crate::ml::reslice::{smart_reslice_chapter, stitch_images_vertically, ResliceProgressFn};
use crate::ml::schemas::{AnalyzeOptions, AnalyzeResponse, CleanRequestRegion, HardwareStatus};
use crate::pipeline::PipelineEngine;

#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<Mutex<PipelineEngine>>,
    pub reslice_progress: ResliceProgressState,
}

impl AppState {
    pub fn new(engine: PipelineEngine) -> Self {
        Self {
            engine: Arc::new(Mutex::new(engine)),
            reslice_progress: ResliceProgressState::default(),
        }
    }
}

/// SHARED, LATEST-VALUE RESLICE PROGRESS FEED FOR THE WEB UI.
///
/// A SIMPLE CURRENT-VALUE HOLDER (NOT A STREAM). THE WEB POLLS
/// `GET /pages/reslice/status` WHILE THE (BLOCKING) RESLICE POST RUNS.
/// THE RESLICE HANDLER REWRITES THIS VALUE AS IT PROGRESSES AND SETS
/// `done = true` ON COMPLETION. A PLAIN `std::sync::Mutex` IS USED
/// BECAUSE THE PROGRESS CALLBACK FIRES FROM RAYON WORKER THREADS.
#[derive(Clone, Default)]
pub struct ResliceProgressState {
    pub current: Arc<std::sync::Mutex<ResliceProgressFrame>>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct ResliceProgressFrame {
    pub pct: u32,
    pub message: String,
    pub done: bool,
}

impl Default for ResliceProgressFrame {
    fn default() -> Self {
        Self {
            pct: 0,
            message: "Stitching canvas…".to_string(),
            done: false,
        }
    }
}

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health_handler))
        .route("/system/hardware", get(hardware_get_handler))
        .route("/system/device", post(hardware_set_handler))
        .route("/pages/analyze", post(analyze_handler))
        .route("/pages/clean", post(clean_handler))
        .route("/pages/preprocess", post(preprocess_handler))
        .route("/pages/stitch", post(stitch_handler))
        .route("/pages/reslice", post(reslice_handler))
        .route("/pages/reslice/status", get(reslice_status_handler))
        .route("/pages/reslice/reset", post(reslice_reset_handler))
        .layer(DefaultBodyLimit::max(128 * 1024 * 1024))
        .layer(cors)
        .with_state(state)
}

async fn health_handler(State(state): State<AppState>) -> Json<serde_json::Value> {
    let engine = state.engine.lock().unwrap();
    let hw = get_hardware_status();

    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "app_version": crate::server::web_assets::APP_VERSION,
        "web_build_hash": crate::server::web_assets::WEB_BUILD_HASH,
        "web_build_time": crate::server::web_assets::WEB_BUILD_TIME,
        "accelerator": hw.device_label,
        "providers": hw.providers,
        "detector": if engine.detector.is_some() { "comic-ctd" } else { "rapidocr-fallback" },
        "inpainter": if engine.inpainter.is_some() { "lama-onnx" } else { "unsupported" },
        "ocr": "rapidocr",
        "models_dir": "models"
    }))
}

async fn hardware_get_handler() -> Json<HardwareStatus> {
    Json(get_hardware_status())
}

#[derive(serde::Deserialize)]
struct SetDevicePayload {
    #[serde(alias = "device")]
    provider: Option<String>,
}

async fn hardware_set_handler(
    State(state): State<AppState>,
    Json(payload): Json<SetDevicePayload>,
) -> Json<HardwareStatus> {
    let prov = payload.provider.unwrap_or_else(|| "auto".to_string());
    let status = set_active_provider(&prov);

    // Dynamically reload the pipeline engine with the newly active execution provider
    if let Ok(mut engine) = state.engine.lock() {
        let models_dir = std::env::var("MODELS_DIR").unwrap_or_else(|_| "models".to_string());
        *engine = PipelineEngine::new(models_dir);
    }

    Json(status)
}

async fn analyze_handler(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<AnalyzeResponse>, (StatusCode, String)> {
    let mut image_bytes = None;
    let mut source_lang = None;
    let mut target_lang = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or_default().to_string();
        if name == "image" || name == "file" {
            if let Ok(bytes) = field.bytes().await {
                if !bytes.is_empty() {
                    image_bytes = Some(bytes);
                }
            }
        } else if name == "source_lang" || name == "sourceLang" || name == "src_lan" || name == "src_lang" {
            if let Ok(text) = field.text().await {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    source_lang = Some(trimmed.to_string());
                }
            }
        } else if name == "target_lang" || name == "targetLang" || name == "tgt_lan" || name == "tgt_lang" {
            if let Ok(text) = field.text().await {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    target_lang = Some(trimmed.to_string());
                }
            }
        } else if image_bytes.is_none() && name.is_empty() {
            if let Ok(bytes) = field.bytes().await {
                if !bytes.is_empty() {
                    image_bytes = Some(bytes);
                }
            }
        }
    }

    let bytes = match image_bytes {
        Some(b) => b,
        None => return Err((StatusCode::BAD_REQUEST, "Missing image field in multipart upload".to_string())),
    };

    let img = image::load_from_memory(&bytes)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid image format: {}", e)))?;

    let options = AnalyzeOptions {
        source_lang,
        target_lang,
    };

    let mut engine = state.engine.lock().unwrap();
    let res = engine.analyze_image_with_options(&img, Some(&options))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Analysis pipeline error: {}", e)))?;

    Ok(Json(res))
}

async fn clean_handler(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Response, (StatusCode, String)> {
    let mut image_bytes = None;
    let mut regions_json = None;
    let mut inpaint_mode = "patch".to_string();

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or_default().to_string();
        if name == "image" || name == "file" {
            if let Ok(bytes) = field.bytes().await {
                image_bytes = Some(bytes);
            }
        } else if name == "regions" {
            if let Ok(text) = field.text().await {
                regions_json = Some(text);
            }
        } else if name == "inpaint_mode" || name == "mode" {
            if let Ok(text) = field.text().await {
                if !text.trim().is_empty() {
                    inpaint_mode = text.trim().to_string();
                }
            }
        }
    }

    let bytes = match image_bytes {
        Some(b) => b,
        None => return Err((StatusCode::BAD_REQUEST, "Missing image field in multipart upload".to_string())),
    };

    let img = image::load_from_memory(&bytes)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid image format: {}", e)))?;

    let regions: Vec<CleanRequestRegion> = if let Some(raw_json) = regions_json {
        serde_json::from_str(&raw_json).unwrap_or_default()
    } else {
        Vec::new()
    };

    let mut engine = state.engine.lock().unwrap();
    let cleaned = engine.clean_image(&img, &regions, &inpaint_mode)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Inpainting failed: {}", e)))?;

    let mut out_bytes = std::io::Cursor::new(Vec::new());
    cleaned.write_to(&mut out_bytes, image::ImageFormat::WebP)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("WebP encode failed: {}", e)))?;

    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "image/webp")],
        out_bytes.into_inner(),
    ).into_response())
}

async fn preprocess_handler(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Response, (StatusCode, String)> {
    let mut image_bytes = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or_default().to_string();
        if name == "image" || name == "file" || name.is_empty() {
            if let Ok(bytes) = field.bytes().await {
                image_bytes = Some(bytes);
                break;
            }
        }
    }

    let bytes = match image_bytes {
        Some(b) => b,
        None => return Err((StatusCode::BAD_REQUEST, "Missing image field".to_string())),
    };

    let img = image::load_from_memory(&bytes)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid image format: {}", e)))?;

    let engine = state.engine.lock().unwrap();
    let color_wm_mask = engine.watermark.create_bubble_watermark_mask(&img, 210, 20, 35, 15);
    let cleaned = engine.watermark.inpaint_colliding_watermarks(&img, &color_wm_mask);

    let mut out_bytes = std::io::Cursor::new(Vec::new());
    cleaned.write_to(&mut out_bytes, image::ImageFormat::WebP)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("WebP encode failed: {}", e)))?;

    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "image/webp")],
        out_bytes.into_inner(),
    ).into_response())
}

async fn stitch_handler(
    mut multipart: Multipart,
) -> Result<Response, (StatusCode, String)> {
    let mut top_bytes = None;
    let mut bot_bytes = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or_default().to_string();
        if name == "image_top" {
            if let Ok(bytes) = field.bytes().await {
                top_bytes = Some(bytes);
            }
        } else if name == "image_bottom" {
            if let Ok(bytes) = field.bytes().await {
                bot_bytes = Some(bytes);
            }
        }
    }

    let t_bytes = top_bytes.ok_or_else(|| (StatusCode::BAD_REQUEST, "Missing image_top".to_string()))?;
    let b_bytes = bot_bytes.ok_or_else(|| (StatusCode::BAD_REQUEST, "Missing image_bottom".to_string()))?;

    let img1 = image::load_from_memory(&t_bytes).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let img2 = image::load_from_memory(&b_bytes).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let stitched = stitch_images_vertically(&[img1, img2]);
    let mut out_bytes = std::io::Cursor::new(Vec::new());
    stitched.write_to(&mut out_bytes, image::ImageFormat::WebP)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "image/webp")],
        out_bytes.into_inner(),
    ).into_response())
}

async fn reslice_handler(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Response, (StatusCode, String)> {
    // RESET THE SHARED PROGRESS STATE AT THE START OF A NEW RUN. WITHOUT THIS,
    // THE FIRST STATUS POLL READS THE PREVIOUS RUN'S `pct=100, done=true` AND THE
    // WEB UI INSTANTLY JUMPS TO ~97% BEFORE THIS RUN HAS DONE ANY WORK.
    if let Ok(mut guard) = state.reslice_progress.current.lock() {
        *guard = ResliceProgressFrame {
            pct: 0,
            message: "Stitching canvas…".to_string(),
            done: false,
        };
    }

    let mut images = Vec::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        if let Ok(bytes) = field.bytes().await {
            if let Ok(img) = image::load_from_memory(&bytes) {
                images.push(img);
            }
        }
    }

    if images.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No valid images in upload".to_string()));
    }

    let slices = {
        let mut engine_guard = state.engine.lock().map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to lock engine: {}", e))
        })?;
        let engine = &mut *engine_guard;
        let progress = state.reslice_progress.current.clone();
        let progress_cb: &ResliceProgressFn = &move |pct| {
            let frame = ResliceProgressFrame {
                pct,
                message: reslice_message_for(pct),
                done: false,
            };
            if let Ok(mut guard) = progress.lock() {
                *guard = frame;
            }
        };
        smart_reslice_chapter(
            &images,
            1600,
            1000,
            2400,
            engine.detector.as_mut(),
            engine.ocr.as_mut(),
            Some(progress_cb),
        )
    };

    // MARK TERMINAL COMPLETION SO THE WEB STATUS POLL KNOWS TO STOP.
    if let Ok(mut guard) = state.reslice_progress.current.lock() {
        *guard = ResliceProgressFrame {
            pct: 100,
            message: "Reslice complete.".to_string(),
            done: true,
        };
    }

    // PARALLEL MULTI-CORE WEBP ENCODING VIA RAYON
    let encoded_slices: Vec<(usize, Vec<u8>)> = slices
        .par_iter()
        .enumerate()
        .map(|(idx, slice)| {
            let mut webp_buf = std::io::Cursor::new(Vec::new());
            let _ = slice.write_to(&mut webp_buf, image::ImageFormat::WebP);
            (idx, webp_buf.into_inner())
        })
        .collect();

    // CREATE IN-MEMORY ZIP ARCHIVE
    let mut zip_buffer = std::io::Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut zip_buffer);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);

        use std::io::Write;
        for (idx, webp_bytes) in &encoded_slices {
            let _ = zip.start_file(format!("{}.webp", idx), options);
            let _ = zip.write_all(webp_bytes);
        }
        let _ = zip.finish();
    }

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/zip"),
            (header::HeaderName::from_static("x-slice-count"), &slices.len().to_string()),
        ],
        zip_buffer.into_inner(),
    ).into_response())
}

/// HUMAN-READABLE PROGRESS LABEL FOR A NORMALIZED RESLICE PERCENTAGE.
fn reslice_message_for(pct: u32) -> String {
    match pct {
        0..=5 => "Reading & stitching canvas…".to_string(),
        6..=44 => format!("Analyzing canvas rows… {pct}%"),
        45..=69 => "Detecting speech bubbles & protecting dialogue…".to_string(),
        70..=94 => format!("Finding clean gutters & slicing pages… {pct}%"),
        95..=99 => "Encoding pages…".to_string(),
        _ => "Reslice complete.".to_string(),
    }
}

/// GET /pages/reslice/status — POLLED BY THE WEB WHILE THE RESLICE POST RUNS.
/// RETURNS THE LATEST `pct` (0..=100), `message`, AND `done` FLAG.
async fn reslice_status_handler(
    State(state): State<AppState>,
) -> Json<ResliceProgressFrame> {
    let frame = state.reslice_progress.current.lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    Json(frame)
}

/// POST /pages/reslice/reset — CLEARS STALE PROGRESS FROM A PREVIOUS RUN.
/// CALLED BY THE WEB *BEFORE* IT STARTS THE RESLICE POST + POLL LOOP, SO THE
/// FIRST POLL CANNOT READ A LEFTOVER `pct=100, done=true` AND INSTANTLY JUMP.
async fn reslice_reset_handler(
    State(state): State<AppState>,
) -> StatusCode {
    if let Ok(mut guard) = state.reslice_progress.current.lock() {
        *guard = ResliceProgressFrame {
            pct: 0,
            message: "Stitching canvas…".to_string(),
            done: false,
        };
    }
    StatusCode::OK
}
