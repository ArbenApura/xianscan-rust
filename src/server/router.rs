use std::sync::{Arc, Mutex};
use axum::{
    extract::{DefaultBodyLimit, Multipart, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use tower_http::cors::{Any, CorsLayer};

use crate::ml::device::{get_hardware_status, set_active_provider};
use crate::ml::reslice::{smart_reslice_chapter, stitch_images_vertically};
use crate::ml::schemas::{AnalyzeOptions, AnalyzeResponse, CleanRequestRegion, HardwareStatus};
use crate::pipeline::PipelineEngine;

#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<Mutex<PipelineEngine>>,
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
        .layer(DefaultBodyLimit::max(128 * 1024 * 1024))
        .layer(cors)
        .with_state(state)
}

async fn health_handler(State(state): State<AppState>) -> Json<serde_json::Value> {
    let engine = state.engine.lock().unwrap();
    let hw = get_hardware_status();

    Json(serde_json::json!({
        "status": "ok",
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
    mut multipart: Multipart,
) -> Result<Response, (StatusCode, String)> {
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

    let slices = smart_reslice_chapter(&images, 1600, 1000, 2400);

    // Create in-memory ZIP archive
    let mut zip_buffer = std::io::Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut zip_buffer);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);

        use std::io::Write;
        for (idx, slice) in slices.iter().enumerate() {
            let mut webp_buf = std::io::Cursor::new(Vec::new());
            let _ = slice.write_to(&mut webp_buf, image::ImageFormat::WebP);
            let _ = zip.start_file(format!("{}.webp", idx), options);
            let _ = zip.write_all(&webp_buf.into_inner());
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
