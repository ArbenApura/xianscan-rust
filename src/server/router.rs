use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
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
use image::DynamicImage;

use crate::ml::device::{
    get_hardware_status, get_system_telemetry, set_active_provider, set_cuda_memory_limit_override,
};
use crate::ml::reslice::{smart_reslice_chapter, stitch_images_vertically, ResliceProgressFn};
use crate::ml::schemas::{
    AnalyzeOptions, AnalyzeResponse, CleanRequestRegion, HardwareStatus, SystemTelemetry,
};
use crate::pipeline::PipelineEngine;

static ACTIVE_OCR_JOBS: AtomicUsize = AtomicUsize::new(0);
static QUEUED_OCR_JOBS: AtomicUsize = AtomicUsize::new(0);

#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<Mutex<PipelineEngine>>,
    pub reslice_progress: ResliceProgressState,
    /// TRUE WHILE A DEVICE-SWITCH ENGINE RELOAD IS RUNNING IN THE BACKGROUND. THE WEB UI
    /// POLLS THIS VIA GET /system/hardware TO SHOW A "RELOADING MODELS" INDICATOR.
    pub reloading: Arc<AtomicBool>,
    /// MONOTONIC RELOAD GENERATION. BUMPED ON EVERY DEVICE SWITCH; A RELOAD TASK ONLY CLEARS
    /// reloading IF IT IS STILL THE LATEST GENERATION, SO A STALE (OVERLAPPED) RELOAD CAN NEVER
    /// MARK THE ENGINE READY WHILE A NEWER SWITCH IS STILL LOADING.
    pub reload_gen: Arc<AtomicU64>,
}

impl AppState {
    pub fn new(engine: PipelineEngine) -> Self {
        Self {
            engine: Arc::new(Mutex::new(engine)),
            reslice_progress: ResliceProgressState::default(),
            reloading: Arc::new(AtomicBool::new(false)),
            reload_gen: Arc::new(AtomicU64::new(0)),
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
///
/// `run` IS A MONOTONIC RUN ID BUMPED BY EVERY `/pages/reslice/reset`.
/// EVERY FRAME IS TAGGED WITH ITS RUN ID SO THE WEB CAN IGNORE FRAMES
/// FROM A STALE RUN THAT IS STILL WINDING DOWN AFTER A CANCEL.
/// `cancelled_run` HOLDS THE RUN ID THE CLIENT ASKED TO STOP (0 = NONE);
/// HANDLERS COMPARE IT AGAINST THEIR OWN RUN ID AT CHECKPOINTS, SO A
/// CANCEL OF AN OLD RUN CAN NEVER KILL A NEWER ONE.
#[derive(Clone, Default)]
pub struct ResliceProgressState {
    pub current: Arc<std::sync::Mutex<ResliceProgressFrame>>,
    pub run: Arc<AtomicU64>,
    pub cancelled_run: Arc<AtomicU64>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct ResliceProgressFrame {
    pub pct: u32,
    pub message: String,
    pub done: bool,
    pub run: u64,
}

impl Default for ResliceProgressFrame {
    fn default() -> Self {
        Self {
            pct: 0,
            message: "Stitching canvas…".to_string(),
            done: false,
            run: 0,
        }
    }
}

/// REQUEST BODY FOR `POST /pages/reslice/cancel`. `run = 0` MEANS "CANCEL
/// WHATEVER THE CURRENT RUN IS".
#[derive(serde::Deserialize)]
struct CancelResliceRequest {
    #[serde(default)]
    run: u64,
}

/// RESPONSE BODY FOR `POST /pages/reslice/reset`.
#[derive(serde::Serialize)]
struct ResetResliceResponse {
    run: u64,
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
        .route("/system/telemetry", get(telemetry_get_handler))
        .route("/pages/analyze", post(analyze_handler))
        .route("/pages/clean", post(clean_handler))
        .route("/pages/preprocess", post(preprocess_handler))
        .route("/pages/stitch", post(stitch_handler))
        .route("/pages/reslice", post(reslice_handler))
        .route("/pages/reslice/status", get(reslice_status_handler))
        .route("/pages/reslice/reset", post(reslice_reset_handler))
        .route("/pages/reslice/cancel", post(reslice_cancel_handler))
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
        "detector": if let Some(ref d) = engine.detector { d.backend_name() } else { "rapidocr-fallback" },
        "inpainter": if engine.inpainter.is_some() { "lama-onnx" } else { "unsupported" },
        "ocr": "rapidocr",
        "models_dir": "models"
    }))
}

async fn hardware_get_handler(State(state): State<AppState>) -> Json<HardwareStatus> {
    let mut status = get_hardware_status();
    status.reloading = state.reloading.load(Ordering::SeqCst);
    Json(status)
}

async fn telemetry_get_handler() -> Json<SystemTelemetry> {
    let active = ACTIVE_OCR_JOBS.load(Ordering::Relaxed);
    let queued = QUEUED_OCR_JOBS.load(Ordering::Relaxed);
    let telemetry = get_system_telemetry(active, queued);
    Json(telemetry)
}

#[derive(serde::Deserialize)]
struct SetDevicePayload {
    #[serde(alias = "device")]
    provider: Option<String>,
    vram_limit_mb: Option<usize>,
}

async fn hardware_set_handler(
    State(state): State<AppState>,
    Json(payload): Json<SetDevicePayload>,
) -> Json<HardwareStatus> {
    if let Some(vram_mb) = payload.vram_limit_mb {
        let _ = set_cuda_memory_limit_override(if vram_mb == 0 { None } else { Some(vram_mb) });
    }
    let prov = payload.provider.unwrap_or_else(|| "auto".to_string());
    // SWITCH THE ACTIVE PROVIDER IMMEDIATELY (CHEAP — NO MODEL LOADING) SO THE RESPONSE RETURNS FAST.
    let mut status = set_active_provider(&prov);

    // RELOAD THE ENGINE (RE-CREATES ALL ONNX SESSIONS ON THE NEW PROVIDER) IN A BACKGROUND TASK.
    // LOADING ~400MB OF MODEL WEIGHTS IS SLOW; WE MUST NOT BLOCK THE HTTP RESPONSE ON IT. THE
    // reloading FLAG LETS THE WEB UI SHOW A "RELOADING MODELS" INDICATOR AND POLL FOR COMPLETION.
    let engine = state.engine.clone();
    let reloading = state.reloading.clone();
    let reload_gen = state.reload_gen.clone();
    let models_dir = std::env::var("MODELS_DIR").unwrap_or_else(|_| "models".to_string());

    // CLAIM A NEW GENERATION FOR THIS SWITCH AND MARK THE ENGINE AS RELOADING.
    let my_gen = reload_gen.fetch_add(1, Ordering::SeqCst) + 1;
    reloading.store(true, Ordering::SeqCst);

    tokio::task::spawn_blocking(move || {
        if let Ok(mut engine_guard) = engine.lock() {
            *engine_guard = PipelineEngine::new(&models_dir);
        }
        // ONLY THE LATEST SWITCH MAY CLEAR THE FLAG — AN OVERLAPPED, STALE RELOAD MUST NOT
        // REPORT READY WHILE A NEWER SWITCH IS STILL LOADING MODELS.
        if reload_gen.load(Ordering::SeqCst) == my_gen {
            reloading.store(false, Ordering::SeqCst);
        }
    });

    status.reloading = true;
    Json(status)
}

async fn analyze_handler(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<AnalyzeResponse>, (StatusCode, String)> {
    let mut image_bytes = None;
    let mut source_lang = None;
    let mut target_lang = None;
    let mut inpaint_padding_pct = None;
    let mut typeset_padding_pct = None;
    let mut enable_watermark_inpaint = None;
    let mut enable_sfx = None;
    let mut sfx_max_area_pct = None;
    let mut allow_degraded_fallback = None;

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
        } else if name == "inpaint_padding_pct" || name == "inpaintPaddingPct" {
            if let Ok(text) = field.text().await {
                if let Ok(val) = text.trim().parse::<f32>() {
                    inpaint_padding_pct = Some(val);
                }
            }
        } else if name == "typeset_padding_pct" || name == "typesetPaddingPct" {
            if let Ok(text) = field.text().await {
                if let Ok(val) = text.trim().parse::<f32>() {
                    typeset_padding_pct = Some(val);
                }
            }
        } else if name == "enable_watermark_inpaint" || name == "enableWatermarkInpaint" {
            if let Ok(text) = field.text().await {
                let trimmed = text.trim().to_lowercase();
                enable_watermark_inpaint = Some(trimmed == "true" || trimmed == "1");
            }
        } else if name == "enable_sfx" || name == "enableSfx" || name == "enable_sfx_inpaint" {
            if let Ok(text) = field.text().await {
                let trimmed = text.trim().to_lowercase();
                enable_sfx = Some(trimmed == "true" || trimmed == "1");
            }
        } else if name == "sfx_max_area_pct" || name == "sfxMaxAreaPct" {
            if let Ok(text) = field.text().await {
                if let Ok(val) = text.trim().parse::<f32>() {
                    sfx_max_area_pct = Some(val);
                }
            }
        } else if name == "allow_degraded_fallback" || name == "allowDegradedFallback" {
            if let Ok(text) = field.text().await {
                let trimmed = text.trim().to_lowercase();
                allow_degraded_fallback = Some(trimmed == "true" || trimmed == "1");
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
        inpaint_padding_pct,
        typeset_padding_pct,
        enable_watermark_inpaint,
        enable_sfx,
        sfx_max_area_pct,
        allow_degraded_fallback,
    };

    let t_req_start = std::time::Instant::now();
    let engine_lock = state.engine.clone();
    QUEUED_OCR_JOBS.fetch_add(1, Ordering::SeqCst);
    let mut res = tokio::task::spawn_blocking(move || -> Result<AnalyzeResponse, (StatusCode, String)> {
        let t_lock_start = std::time::Instant::now();
        let mut engine = match engine_lock.lock() {
            Ok(guard) => guard,
            Err(e) => {
                QUEUED_OCR_JOBS.fetch_sub(1, Ordering::SeqCst);
                return Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to lock engine: {}", e)));
            }
        };
        let lock_wait_ms = t_lock_start.elapsed().as_secs_f64() * 1000.0;
        QUEUED_OCR_JOBS.fetch_sub(1, Ordering::SeqCst);
        ACTIVE_OCR_JOBS.fetch_add(1, Ordering::SeqCst);

        let analyze_res = engine.analyze_image_with_options(&img, Some(&options));
        ACTIVE_OCR_JOBS.fetch_sub(1, Ordering::SeqCst);

        let mut analyzed = analyze_res
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Analysis pipeline error: {}", e)))?;
        if let Some(ref mut st) = analyzed.stats {
            st.queue_wait_ms = Some(lock_wait_ms);
        }
        Ok(analyzed)
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))??;

    if let Some(ref mut st) = res.stats {
        st.server_request_time_ms = Some(t_req_start.elapsed().as_secs_f64() * 1000.0);
    }

    schedule_idle_memory_trim();
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

    let engine_lock = state.engine.clone();
    let out_bytes = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, (StatusCode, String)> {
        let mut engine = engine_lock.lock().map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to lock engine: {}", e))
        })?;
        let cleaned = engine.clean_image(&img, &regions, &inpaint_mode)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Inpainting failed: {}", e)))?;

        let mut out_bytes = std::io::Cursor::new(Vec::new());
        cleaned.write_to(&mut out_bytes, image::ImageFormat::WebP)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("WebP encode failed: {}", e)))?;
        Ok(out_bytes.into_inner())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))??;

    schedule_idle_memory_trim();
    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "image/webp")],
        out_bytes,
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

    let engine_lock = state.engine.clone();
    let out_bytes = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, (StatusCode, String)> {
        let engine = engine_lock.lock().map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to lock engine: {}", e))
        })?;
        let color_wm_mask = engine.watermark.create_bubble_watermark_mask(&img, 210, 20, 35, 15);
        let cleaned = engine.watermark.inpaint_colliding_watermarks(&img, &color_wm_mask);

        let mut out_bytes = std::io::Cursor::new(Vec::new());
        cleaned.write_to(&mut out_bytes, image::ImageFormat::WebP)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("WebP encode failed: {}", e)))?;
        Ok(out_bytes.into_inner())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))??;

    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "image/webp")],
        out_bytes,
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
    // RESOLVE THIS RUN'S ID: THE WEB SENDS THE ID IT RECEIVED FROM
    // `/pages/reslice/reset` SO PROGRESS FRAMES & CANCELS MATCH THE RIGHT RUN.
    // FALL BACK TO THE CURRENT COUNTER WHEN THE FIELD IS ABSENT.
    let mut run_id = state.reslice_progress.run.load(Ordering::Relaxed);
    let mut images = Vec::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("run") {
            if let Ok(text) = field.text().await {
                if let Ok(parsed) = text.parse::<u64>() {
                    run_id = parsed;
                }
            }
            continue;
        }
        if let Ok(bytes) = field.bytes().await {
            if let Ok(img) = image::load_from_memory(&bytes) {
                images.push(img);
            }
        }
    }

    if images.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No valid images in upload".to_string()));
    }

    // RESET THE SHARED PROGRESS STATE AT THE START OF A NEW RUN (TAGGED WITH
    // THIS RUN'S ID). WITHOUT THIS, THE FIRST STATUS POLL READS THE PREVIOUS
    // RUN'S `pct=100, done=true` AND THE WEB UI JUMPS TO ~97% PREMATURELY.
    if let Ok(mut guard) = state.reslice_progress.current.lock() {
        *guard = ResliceProgressFrame {
            pct: 0,
            message: "Stitching canvas…".to_string(),
            done: false,
            run: run_id,
        };
    }

    // ALREADY CANCELLED WHILE THE UPLOAD WAS IN FLIGHT — BAIL BEFORE BLOCKING ON
    // THE ENGINE LOCK SO A FRESH RUN IS NOT DELAYED BY A DEAD REQUEST.
    if state.reslice_progress.cancelled_run.load(Ordering::Relaxed) == run_id {
        return Err((StatusCode::BAD_REQUEST, "Reslice cancelled.".to_string()));
    }

    let cancelled_flag = state.reslice_progress.cancelled_run.clone();
    let engine_lock = state.engine.clone();
    let progress_lock = state.reslice_progress.current.clone();
    let cancelled_flag_clone = cancelled_flag.clone();
    let slices = tokio::task::spawn_blocking(move || -> Result<Vec<DynamicImage>, (StatusCode, String)> {
        let mut engine_guard = engine_lock.lock().map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to lock engine: {}", e))
        })?;
        let engine = &mut *engine_guard;
        let progress_cb: &ResliceProgressFn = &move |pct| {
            let frame = ResliceProgressFrame {
                pct,
                message: reslice_message_for(pct),
                done: false,
                run: run_id,
            };
            if let Ok(mut guard) = progress_lock.lock() {
                *guard = frame;
            }
        };
        Ok(smart_reslice_chapter(
            &images,
            1600,
            1000,
            2400,
            engine.detector.as_mut(),
            engine.ocr.as_mut(),
            Some(progress_cb),
            Some(&cancelled_flag_clone),
            run_id,
        ))
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))??;

    // CANCELLED BY THE CLIENT — BAIL BEFORE ENCODING. NO TERMINAL `done` FRAME:
    // THIS RUN'S POLLER IS GONE AND A NEWER RUN MAY ALREADY OWN THE FRAME.
    if state.reslice_progress.cancelled_run.load(Ordering::Relaxed) == run_id {
        return Err((StatusCode::BAD_REQUEST, "Reslice cancelled.".to_string()));
    }

    // PHASE D (90..=99%): PARALLEL MULTI-CORE WEBP ENCODING VIA RAYON. REPORT
    // PER-PAGE PROGRESS SO THE BAR KEEPS MOVING WHILE PAGES ARE ENCODED.
    let total_slices = slices.len().max(1) as f32;
    let encoded_counter = std::sync::atomic::AtomicU32::new(0);
    let encode_progress = state.reslice_progress.current.clone();
    let encoded_slices: Vec<(usize, Vec<u8>)> = slices
        .par_iter()
        .enumerate()
        .map(|(idx, slice)| {
            let mut webp_buf = std::io::Cursor::new(Vec::new());
            let _ = slice.write_to(&mut webp_buf, image::ImageFormat::WebP);
            let done_count = encoded_counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            let pct = (90 + ((done_count as f32 / total_slices) * 9.0) as u32).min(99);
            if let Ok(mut guard) = encode_progress.lock() {
                *guard = ResliceProgressFrame {
                    pct,
                    message: reslice_message_for(pct),
                    done: false,
                    run: run_id,
                };
            }
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

    // MARK TERMINAL COMPLETION SO THE WEB STATUS POLL KNOWS TO STOP. SET ONLY
    // AFTER ENCODING & ZIPPING FINISH — SETTING IT EARLIER HALTS THE POLLS AND
    // FREEZES THE BAR WHILE ENCODING IS STILL RUNNING.
    if let Ok(mut guard) = state.reslice_progress.current.lock() {
        *guard = ResliceProgressFrame {
            pct: 100,
            message: "Reslice complete.".to_string(),
            done: true,
            run: run_id,
        };
    }

    schedule_idle_memory_trim();
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
/// BANDS MIRROR THE PHASE WEIGHTS IN `smart_reslice_chapter` / THE HANDLER:
/// STITCH 0..=1, ROW PROFILE 2..=9, DETECTION 10..=79, SLICING 80..=89, ENCODE 90..=99.
fn reslice_message_for(pct: u32) -> String {
    match pct {
        0..=1 => "Reading & stitching canvas…".to_string(),
        2..=9 => format!("Analyzing canvas rows… {pct}%"),
        10..=79 => "Detecting speech bubbles & protecting dialogue…".to_string(),
        80..=89 => format!("Finding clean gutters & slicing pages… {pct}%"),
        90..=99 => format!("Encoding pages… {pct}%"),
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

/// POST /pages/reslice/reset — CLEARS STALE PROGRESS FROM A PREVIOUS RUN AND
/// MINTS A NEW RUN ID. CALLED BY THE WEB *BEFORE* IT STARTS THE RESLICE POST +
/// POLL LOOP, SO THE FIRST POLL CANNOT READ A LEFTOVER `pct=100, done=true`
/// AND INSTANTLY JUMP. THE RETURNED RUN ID TAGS EVERY FRAME OF THE NEW RUN.
async fn reslice_reset_handler(
    State(state): State<AppState>,
) -> Json<ResetResliceResponse> {
    let new_run = state.reslice_progress.run.fetch_add(1, Ordering::Relaxed) + 1;
    if let Ok(mut guard) = state.reslice_progress.current.lock() {
        *guard = ResliceProgressFrame {
            pct: 0,
            message: "Stitching canvas…".to_string(),
            done: false,
            run: new_run,
        };
    }
    Json(ResetResliceResponse { run: new_run })
}

/// POST /pages/reslice/cancel — ASKS THE IN-FLIGHT RESLICE RUN TO STOP AT ITS
/// NEXT CHECKPOINT. THE RESLICE WORK IS SYNCHRONOUS (IT HOLDS THE ENGINE LOCK),
/// SO IT CANNOT BE INTERRUPTED MID-INFERENCE; CHECKPOINTS BETWEEN PHASES/TILES
/// OBSERVE THIS FLAG AND BAIL EARLY. WITHOUT THIS, A CANCELLED RUN KEEPS
/// HOLDING THE ENGINE LOCK AND THE NEXT RESLICE BLOCKS BEHIND IT (UI STUCK AT 2%).
async fn reslice_cancel_handler(
    State(state): State<AppState>,
    body: Option<Json<CancelResliceRequest>>,
) -> StatusCode {
    let requested = body.map(|b| b.0.run).unwrap_or(0);
    // `run = 0` MEANS "CANCEL THE CURRENT RUN".
    let target = if requested == 0 {
        state.reslice_progress.run.load(Ordering::Relaxed)
    } else {
        requested
    };
    state.reslice_progress.cancelled_run.store(target, Ordering::Relaxed);
    StatusCode::OK
}

/// Dispatches a debounced background task to trim process working set memory after inference completion.
fn schedule_idle_memory_trim() {
    tokio::spawn(async {
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        crate::ml::device::trim_process_memory();
    });
}

