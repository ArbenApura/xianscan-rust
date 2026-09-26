// ML SERVER ACCESS GUARD (FEAT-001 PHASE 6). EACH TEST BUILDS AN ENGINE FROM AN EMPTY MODELS
// DIRECTORY, SO NO WEIGHTS ARE LOADED AND ONLY THE GUARD AND CHEAP ROUTES ARE EXERCISED.
use std::path::Path;
use std::sync::atomic::Ordering;

use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use tower::ServiceExt;
use xianscan_rust::pipeline::PipelineEngine;
use xianscan_rust::server::router::{create_router, AppState};

const SECRET: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PORT: u16 = 8123;

fn secured_state() -> AppState {
    AppState::new(
        PipelineEngine::new(Path::new("target/no-models")),
        std::path::PathBuf::from("target/no-models"),
        xianscan_rust::ml::intake::IntakeLimits::default(),
    )
    .with_security(Some(SECRET.to_string()), PORT)
}

fn app() -> Router {
    create_router(secured_state())
}

fn get(uri: &str) -> axum::http::request::Builder {
    Request::builder().method("GET").uri(uri).header("host", format!("127.0.0.1:{}", PORT))
}

#[tokio::test]
async fn ml_health_is_open_without_secret() {
    let res = app().oneshot(get("/health").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn ml_hardware_requires_secret() {
    let res = app().oneshot(get("/system/hardware").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn ml_hardware_accepts_correct_secret() {
    let req = get("/system/hardware").header("x-xianscan-ml-secret", SECRET).body(Body::empty()).unwrap();
    let res = app().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
}

#[tokio::test]
async fn ml_rejects_wrong_secret() {
    let req = get("/system/hardware").header("x-xianscan-ml-secret", "wrong").body(Body::empty()).unwrap();
    let res = app().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn ml_rejects_origin_header() {
    let req = get("/system/hardware")
        .header("x-xianscan-ml-secret", SECRET)
        .header("origin", "https://evil.example")
        .body(Body::empty())
        .unwrap();
    let res = app().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn ml_rejects_sec_fetch_site_header() {
    let req = get("/health").header("sec-fetch-site", "cross-site").body(Body::empty()).unwrap();
    let res = app().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn ml_rejects_foreign_host_header() {
    let req = Request::builder()
        .method("GET")
        .uri("/health")
        .header("host", "evil.example:8123")
        .body(Body::empty())
        .unwrap();
    let res = app().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    // THE RIGHT HOST ON THE WRONG PORT IS ALSO REFUSED
    let req = Request::builder().method("GET").uri("/health").header("host", "127.0.0.1:9999").body(Body::empty()).unwrap();
    assert_eq!(app().oneshot(req).await.unwrap().status(), StatusCode::FORBIDDEN);

    // localhost AND [::1] ARE FINE
    for host in ["localhost:8123", "[::1]:8123"] {
        let req = Request::builder().method("GET").uri("/health").header("host", host).body(Body::empty()).unwrap();
        assert_eq!(app().oneshot(req).await.unwrap().status(), StatusCode::OK, "host {}", host);
    }
}

#[tokio::test]
async fn ml_has_no_cors_headers() {
    let preflight = Request::builder()
        .method("OPTIONS")
        .uri("/system/hardware")
        .header("host", format!("127.0.0.1:{}", PORT))
        .header("origin", "https://evil.example")
        .header("access-control-request-method", "POST")
        .body(Body::empty())
        .unwrap();
    let res = app().oneshot(preflight).await.unwrap();
    assert!(res.headers().get("access-control-allow-origin").is_none());

    let res = app().oneshot(get("/health").body(Body::empty()).unwrap()).await.unwrap();
    assert!(res.headers().get("access-control-allow-origin").is_none());
}

#[tokio::test]
async fn ml_device_switch_requires_secret() {
    let state = secured_state();
    let app = create_router(state.clone());
    let req = Request::builder()
        .method("POST")
        .uri("/system/device")
        .header("host", format!("127.0.0.1:{}", PORT))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"device":"cpu"}"#))
        .unwrap();
    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    assert!(!state.reloading.load(Ordering::SeqCst));
}
