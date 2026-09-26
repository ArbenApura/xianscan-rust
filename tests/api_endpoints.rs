use std::path::{Path, PathBuf};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;
use xianscan_rust::ml::intake::IntakeLimits;
use xianscan_rust::pipeline::PipelineEngine;
use xianscan_rust::server::router::{create_router, AppState};

/// # Endpoint Test: `/health`
///
/// ## Purpose:
/// Verifies the HTTP server health check probe returns `200 OK`
/// when the server is online and ready to receive requests.
#[tokio::test]
async fn test_health_endpoint() {
    let engine = PipelineEngine::new(Path::new("models"));
    let state = AppState::new(engine, PathBuf::from("models"), IntakeLimits::default());
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

/// # Endpoint Test: `/system/hardware`
///
/// ## Purpose:
/// Verifies that hardware diagnostics (CPU count, DirectML / CUDA / GPU adapter info)
/// can be queried over HTTP and returns status `200 OK`.
#[tokio::test]
async fn test_system_hardware_endpoint() {
    let engine = PipelineEngine::new(Path::new("models"));
    let state = AppState::new(engine, PathBuf::from("models"), IntakeLimits::default());
    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/system/hardware")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

/// # Endpoint Test: `/pages/clean` with Multipart Inpaint Modes
///
/// ## Purpose:
/// Verifies the image inpainting endpoint accepts multipart uploads with custom
/// `inpaint_mode` fields (e.g. "scaled", "patch", "lama") alongside region masks.
#[tokio::test]
async fn test_clean_endpoint_respects_inpaint_strategy_modes() {
    let engine = PipelineEngine::new(Path::new("models"));
    let state = AppState::new(engine, PathBuf::from("models"), IntakeLimits::default());
    let app = create_router(state);

    // Create a 64x64 test image with PNG bytes
    let img_buf = image::ImageBuffer::<image::Rgb<u8>, Vec<u8>>::from_pixel(64, 64, image::Rgb([255, 255, 255]));
    let dyn_img = image::DynamicImage::ImageRgb8(img_buf);
    let mut png_bytes = std::io::Cursor::new(Vec::new());
    dyn_img.write_to(&mut png_bytes, image::ImageFormat::Png).unwrap();
    let img_vec = png_bytes.into_inner();

    let boundary = "boundary123456";
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"test.png\"\r\nContent-Type: image/png\r\n\r\n", boundary).as_bytes());
    body.extend_from_slice(&img_vec);
    body.extend_from_slice(format!("\r\n--{}\r\nContent-Disposition: form-data; name=\"regions\"\r\n\r\n[]\r\n", boundary).as_bytes());
    body.extend_from_slice(format!("--{}\r\nContent-Disposition: form-data; name=\"inpaint_mode\"\r\n\r\nscaled\r\n--{}--\r\n", boundary, boundary).as_bytes());

    let req = Request::builder()
        .method("POST")
        .uri("/pages/clean")
        .header("content-type", format!("multipart/form-data; boundary={}", boundary))
        .body(Body::from(body))
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

/// # Endpoint Test: `/pages/analyze` with Source/Target Language Parameters
///
/// ## Purpose:
/// Verifies the page analysis API parses `source_lang` and `target_lang` options
/// from multipart form fields to configure OCR language routing and filtering.
#[tokio::test]
async fn test_analyze_endpoint_with_language_parameters() {
    let engine = PipelineEngine::new(Path::new("models"));
    let state = AppState::new(engine, PathBuf::from("models"), IntakeLimits::default());
    let app = create_router(state);

    let img_buf = image::ImageBuffer::<image::Rgb<u8>, Vec<u8>>::from_pixel(64, 64, image::Rgb([255, 255, 255]));
    let dyn_img = image::DynamicImage::ImageRgb8(img_buf);
    let mut png_bytes = std::io::Cursor::new(Vec::new());
    dyn_img.write_to(&mut png_bytes, image::ImageFormat::Png).unwrap();
    let img_vec = png_bytes.into_inner();

    let boundary = "boundary789012";
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"test.png\"\r\nContent-Type: image/png\r\n\r\n", boundary).as_bytes());
    body.extend_from_slice(&img_vec);
    body.extend_from_slice(format!("\r\n--{}\r\nContent-Disposition: form-data; name=\"source_lang\"\r\n\r\nzh-Hans\r\n", boundary).as_bytes());
    body.extend_from_slice(format!("--{}\r\nContent-Disposition: form-data; name=\"target_lang\"\r\n\r\nen\r\n--{}--\r\n", boundary, boundary).as_bytes());

    let req = Request::builder()
        .method("POST")
        .uri("/pages/analyze")
        .header("content-type", format!("multipart/form-data; boundary={}", boundary))
        .body(Body::from(body))
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

// -- INPUT LIMITS (FEAT-002) -- //

use xianscan_rust::server::router::{create_router_with_limits, RouteLimits};

/// ENGINE WITHOUT MODEL WEIGHTS: THE LIMIT CHECKS RUN BEFORE ANY INFERENCE.
fn light_state() -> AppState {
    AppState::new(
        PipelineEngine::new(Path::new("target/no-models")),
        PathBuf::from("target/no-models"),
        IntakeLimits::default(),
    )
}

/// PNG WITH NOISY PIXELS SO IT DOES NOT COMPRESS (SIZE IS ROUGHLY w * h * 3 BYTES).
fn noisy_png(width: u32, height: u32, seed: u32) -> Vec<u8> {
    let mut x = seed.wrapping_mul(2_654_435_761).wrapping_add(1);
    let buf = image::ImageBuffer::<image::Rgb<u8>, Vec<u8>>::from_fn(width, height, |_, _| {
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        image::Rgb([x as u8, (x >> 8) as u8, (x >> 16) as u8])
    });
    let mut out = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(buf).write_to(&mut out, image::ImageFormat::Png).unwrap();
    out.into_inner()
}

fn plain_png(width: u32, height: u32) -> Vec<u8> {
    let buf = image::ImageBuffer::<image::Rgb<u8>, Vec<u8>>::from_pixel(width, height, image::Rgb([90, 90, 90]));
    let mut out = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(buf).write_to(&mut out, image::ImageFormat::Png).unwrap();
    out.into_inner()
}

/// MULTIPART REQUEST WITH ONE FILE PART PER `(field name, bytes)`.
fn multipart_request(uri: &str, parts: &[(&str, Vec<u8>)]) -> Request<Body> {
    let boundary = "limitboundary42";
    let mut body = Vec::new();
    for (i, (name, bytes)) in parts.iter().enumerate() {
        body.extend_from_slice(
            format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"p{i}.png\"\r\nContent-Type: image/png\r\n\r\n").as_bytes(),
        );
        body.extend_from_slice(bytes);
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", format!("multipart/form-data; boundary={boundary}"))
        .body(Body::from(body))
        .unwrap()
}

async fn body_text(response: axum::response::Response) -> String {
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    String::from_utf8_lossy(&bytes).into_owned()
}

#[tokio::test]
async fn test_reslice_rejects_undecodable_part() {
    let app = create_router(light_state());
    let garbage: Vec<u8> = (0..2048_u32).map(|i| (i.wrapping_mul(7919) >> 3) as u8).collect();
    let req = multipart_request(
        "/pages/reslice",
        &[("files", plain_png(300, 800)), ("files", plain_png(300, 800)), ("files", garbage)],
    );

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let text = body_text(response).await;
    assert!(text.contains("Image 2"), "error should name the bad part: {text}");
}

#[tokio::test]
async fn test_reslice_body_over_limit_is_413() {
    let limits = RouteLimits { reslice_body: 64 * 1024, ..RouteLimits::default() };
    let app = create_router_with_limits(light_state(), limits);
    let parts: Vec<(&str, Vec<u8>)> = (0..3).map(|i| ("files", noisy_png(150, 150, i))).collect();
    assert!(parts.iter().map(|(_, b)| b.len()).sum::<usize>() > 150 * 1024);

    let response = app.oneshot(multipart_request("/pages/reslice", &parts)).await.unwrap();
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert_ne!(
        response.headers().get("content-type").map(|v| v.as_bytes()),
        Some(&b"application/zip"[..])
    );
}

#[tokio::test]
async fn test_reslice_too_many_images_is_413() {
    let state = light_state().with_limits(IntakeLimits { max_images: 2, ..IntakeLimits::default() });
    let app = create_router(state);
    let parts: Vec<(&str, Vec<u8>)> = (0..3).map(|_| ("files", plain_png(300, 400))).collect();

    let response = app.oneshot(multipart_request("/pages/reslice", &parts)).await.unwrap();
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn test_stitch_extreme_aspect_is_422() {
    let app = create_router(light_state());
    let req = multipart_request(
        "/pages/stitch",
        &[("image_top", plain_png(1, 16000)), ("image_bottom", plain_png(16000, 1))],
    );

    let started = std::time::Instant::now();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(started.elapsed() < std::time::Duration::from_secs(2));
}

#[tokio::test]
async fn test_json_route_body_limit() {
    let app = create_router(light_state());
    let padding = "x".repeat(1024 * 1024);
    let req = Request::builder()
        .method("POST")
        .uri("/pages/reslice/cancel")
        .header("content-type", "application/json")
        .body(Body::from(format!("{{\"run\": 1, \"pad\": \"{padding}\"}}")))
        .unwrap();

    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

/// A LARGE STITCH RUNS ON THE BLOCKING POOL, SO /health STILL ANSWERS QUICKLY. ONE ASYNC WORKER AND BOTH
/// REQUESTS SPAWNED AS TASKS: IF THE STITCH RAN ON THE WORKER, /health WOULD WAIT FOR IT TO FINISH.
#[tokio::test(flavor = "multi_thread", worker_threads = 1)]
async fn test_health_responsive_during_stitch() {
    let app = create_router(light_state());
    let health = || Request::builder().uri("/health").body(Body::empty()).unwrap();
    // WARM UP (FIRST HARDWARE PROBE CAN BE SLOW)
    assert_eq!(app.clone().oneshot(health()).await.unwrap().status(), StatusCode::OK);

    // THE NARROWER BOTTOM IMAGE IS RESIZED TO 2000 x 20000, WHICH KEEPS THE STITCH BUSY FOR A WHILE
    let req = multipart_request(
        "/pages/stitch",
        &[("image_top", plain_png(2000, 20_000)), ("image_bottom", plain_png(1000, 10_000))],
    );
    let stitch_app = app.clone();
    let stitch = tokio::spawn(async move { stitch_app.oneshot(req).await.unwrap().status() });
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    if stitch.is_finished() { panic!("stitch finished too fast: {:?}", stitch.await.unwrap()); }

    let health_app = app.clone();
    let started = std::time::Instant::now();
    let status = tokio::spawn(async move { health_app.oneshot(health()).await.unwrap().status() }).await.unwrap();
    let elapsed = started.elapsed();
    assert_eq!(status, StatusCode::OK);
    assert!(elapsed < std::time::Duration::from_millis(250), "/health took {elapsed:?} during a stitch");

    // THE 40000 PX TALL RESULT IS OVER WEBP'S 16383 PX LIMIT, SO THE ENCODE ITSELF FAILS CLEANLY
    let status = stitch.await.unwrap();
    assert!(status == StatusCode::OK || status == StatusCode::INTERNAL_SERVER_ERROR, "got {status}");
}

#[tokio::test]
async fn test_health_reports_models_dir_and_limits() {
    let limits = IntakeLimits { max_images: 7, ..IntakeLimits::default() };
    let state = AppState::new(
        PipelineEngine::new(Path::new("target/no-models")),
        PathBuf::from("target/no-models"),
        limits,
    );
    let app = create_router(state);

    let response = app.oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let json: serde_json::Value = serde_json::from_str(&body_text(response).await).unwrap();
    assert_eq!(json["models_dir"], PathBuf::from("target/no-models").display().to_string());
    assert_eq!(json["limits"]["max_images"], 7);
    assert_eq!(json["limits"]["reslice_body_bytes"], RouteLimits::default().reslice_body);
}

/// A PANIC WHILE HOLDING A MODEL POISONS ITS LOCK. LATER REQUESTS MUST STILL WORK (NO PERMANENT
/// "FAILED TO LOCK ENGINE"), /health MUST SAY THE ENGINE IS SUSPECT, AND A REBUILD MUST CLEAR IT.
/// (PER-MODEL LOCKS, FEAT-004 PHASE 10: THE CLEAN REQUEST BELOW TAKES THE INPAINTER LOCK.)
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_poisoned_engine_lock_recovers() {
    let state = light_state();
    let engine = state.engine.clone();
    let _ = std::thread::spawn(move || {
        let _guard = engine.inpainter.lock().unwrap();
        panic!("simulated panic while holding the engine");
    })
    .join();
    assert!(state.engine.inpainter.is_poisoned());

    let app = create_router(state.clone());
    let health = || Request::builder().uri("/health").body(Body::empty()).unwrap();
    let json: serde_json::Value =
        serde_json::from_str(&body_text(app.clone().oneshot(health()).await.unwrap()).await).unwrap();
    assert_eq!(json["detector"], "reloading");

    let req = multipart_request("/pages/clean", &[("image", plain_png(64, 64))]);
    let response = app.clone().oneshot(req).await.unwrap();
    let text = body_text(response).await;
    assert!(!text.contains("Failed to lock engine"), "got {text}");
    assert!(!state.engine.inpainter.is_poisoned());

    // THE BACKGROUND REBUILD FINISHES AND CLEARS THE FLAG
    for _ in 0..100 {
        if !state.engine_suspect.load(std::sync::atomic::Ordering::SeqCst) {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert!(!state.engine_suspect.load(std::sync::atomic::Ordering::SeqCst));
}
