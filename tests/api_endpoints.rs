use std::path::Path;
use std::sync::{Arc, Mutex};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;
use xianscan_rust::pipeline::PipelineEngine;
use xianscan_rust::server::router::{create_router, AppState};

#[tokio::test]
async fn test_health_endpoint() {
    let engine = PipelineEngine::new(Path::new("tests/fixtures"));
    let state = AppState {
        engine: Arc::new(Mutex::new(engine)),
    };
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

#[tokio::test]
async fn test_system_hardware_endpoint() {
    let engine = PipelineEngine::new(Path::new("tests/fixtures"));
    let state = AppState {
        engine: Arc::new(Mutex::new(engine)),
    };
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

#[tokio::test]
async fn test_clean_endpoint_respects_inpaint_strategy_modes() {
    let engine = PipelineEngine::new(Path::new("tests/fixtures"));
    let state = AppState {
        engine: Arc::new(Mutex::new(engine)),
    };
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
