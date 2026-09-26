use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, TryLockError};
use axum::{
    body::Bytes,
    extract::{multipart::MultipartError, DefaultBodyLimit, Multipart, Request, State},
    http::{header, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rayon::prelude::*;
use image::DynamicImage;

use crate::ml::device::{
    get_hardware_status, get_system_telemetry, set_active_provider, set_cuda_memory_limit_override,
};
use crate::ml::intake::{decode_for_canvas, decode_image_limited, validate_heights, IntakeError, IntakeLimits};
use crate::ml::reslice::{smart_reslice_chapter_with_models, stitch_images_vertically, ResliceProgressFn};
use crate::ml::schemas::{
    AnalyzeOptions, AnalyzeResponse, CleanRequestRegion, HardwareStatus, SystemTelemetry,
};
use crate::pipeline::shared::{lock_recover, SharedEngine};
use crate::pipeline::PipelineEngine;

static ACTIVE_OCR_JOBS: AtomicUsize = AtomicUsize::new(0);
static QUEUED_OCR_JOBS: AtomicUsize = AtomicUsize::new(0);

#[derive(Clone)]
pub struct AppState {
    /// ONE LOCK PER MODEL (FEAT-004 PHASE 10); SEE SharedEngine FOR THE LOCK ORDER.
    pub engine: Arc<SharedEngine>,
    pub reslice_progress: ResliceProgressState,
    /// TRUE WHILE A DEVICE-SWITCH ENGINE RELOAD IS RUNNING IN THE BACKGROUND. THE WEB UI
    /// POLLS THIS VIA GET /system/hardware TO SHOW A "RELOADING MODELS" INDICATOR.
    pub reloading: Arc<AtomicBool>,
    /// MONOTONIC RELOAD GENERATION. BUMPED ON EVERY DEVICE SWITCH; A RELOAD TASK ONLY CLEARS
    /// reloading IF IT IS STILL THE LATEST GENERATION, SO A STALE (OVERLAPPED) RELOAD CAN NEVER
    /// MARK THE ENGINE READY WHILE A NEWER SWITCH IS STILL LOADING.
    pub reload_gen: Arc<AtomicU64>,
    /// SHARED SECRET THE NODE SERVER SENDS IN `x-xianscan-ml-secret`. NONE = NOT ENFORCED (TESTS).
    pub ml_secret: Option<Arc<str>>,
    /// PORT THE ML SERVER LISTENS ON, FOR THE HOST HEADER CHECK. 0 = UNKNOWN (ANY LOOPBACK PORT).
    pub port: u16,
    /// IMAGE SIZE / COUNT LIMITS, CHECKED BEFORE ANY DECODE.
    pub limits: Arc<IntakeLimits>,
    /// THE MODELS DIRECTORY THE ENGINE WAS BUILT FROM; DEVICE-SWITCH RELOADS USE THE SAME ONE.
    pub models_dir: Arc<PathBuf>,
    /// SET WHEN A REQUEST PANICKED WHILE HOLDING THE ENGINE; CLEARED WHEN THE REBUILD FINISHES.
    pub engine_suspect: Arc<AtomicBool>,
}

impl AppState {
    pub fn new(engine: PipelineEngine, models_dir: PathBuf, limits: IntakeLimits) -> Self {
        Self {
            engine: Arc::new(SharedEngine::from_engine(engine)),
            reslice_progress: ResliceProgressState::default(),
            reloading: Arc::new(AtomicBool::new(false)),
            reload_gen: Arc::new(AtomicU64::new(0)),
            ml_secret: None,
            port: 0,
            limits: Arc::new(limits),
            models_dir: Arc::new(models_dir),
            engine_suspect: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn with_limits(mut self, limits: IntakeLimits) -> Self {
        self.limits = Arc::new(limits);
        self
    }

    /// REQUIRE THE SHARED SECRET ON EVERY ROUTE EXCEPT GET /health, AND PIN THE HOST HEADER PORT.
    pub fn with_security(mut self, secret: Option<String>, port: u16) -> Self {
        self.ml_secret = secret.map(Arc::from);
        self.port = port;
        self
    }
}

static WARNED_NO_SECRET: AtomicBool = AtomicBool::new(false);
pub const ML_SECRET_HEADER: &str = "x-xianscan-ml-secret";

/// HOST HEADER MUST NAME THIS SERVER ON LOOPBACK (BLOCKS DNS REBINDING).
fn is_allowed_host(host: &str, port: u16) -> bool {
    let host = host.trim().to_ascii_lowercase();
    let (name, host_port) = match host.rsplit_once(':') {
        Some((n, p)) if !n.is_empty() && !p.contains(']') => (n.to_string(), p.parse::<u16>().ok()),
        _ => (host.clone(), None),
    };
    let loopback = name == "127.0.0.1" || name == "localhost" || name == "[::1]";
    let port_ok = port == 0 || host_port == Some(port);
    loopback && port_ok
}

/// GUARD FOR EVERY ML ROUTE. BROWSERS ALWAYS SEND `Origin` OR `Sec-Fetch-Site` ON CROSS-ORIGIN
/// REQUESTS, NODE'S fetch SENDS NEITHER, SO ANY REQUEST CARRYING THEM IS FROM A WEB PAGE.
async fn ml_guard(State(state): State<AppState>, req: Request, next: Next) -> Response {
    let headers = req.headers();
    if headers.contains_key(header::ORIGIN) || headers.contains_key("sec-fetch-site") {
        return (StatusCode::FORBIDDEN, "browser requests are not accepted").into_response();
    }
    if let Some(host) = headers.get(header::HOST) {
        let ok = host.to_str().ok().map(|h| is_allowed_host(h, state.port)).unwrap_or(false);
        if !ok {
            return (StatusCode::FORBIDDEN, "unexpected host").into_response();
        }
    }
    if req.method() == Method::GET && req.uri().path() == "/health" {
        return next.run(req).await;
    }
    match &state.ml_secret {
        Some(secret) => {
            let given = headers.get(ML_SECRET_HEADER).and_then(|v| v.to_str().ok()).unwrap_or("");
            if !crate::server::access::ct_eq(given.as_bytes(), secret.as_bytes()) {
                return (StatusCode::UNAUTHORIZED, "missing or wrong ML secret").into_response();
            }
        }
        None => {
            if !WARNED_NO_SECRET.swap(true, Ordering::Relaxed) {
                tracing::warn!("ML SERVER RUNNING WITHOUT A SHARED SECRET; LOOPBACK AND BROWSER CHECKS STILL APPLY");
            }
        }
    }
    next.run(req).await
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

/// REQUEST BODY CAPS PER ROUTE GROUP (FEAT-002 ADR-002). A BODY OVER ITS CAP IS A 413.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RouteLimits {
    pub reslice_body: usize,
    pub stitch_body: usize,
    pub image_body: usize,
    pub json_body: usize,
}

impl Default for RouteLimits {
    fn default() -> Self {
        Self {
            reslice_body: 512 * 1024 * 1024,
            stitch_body: 128 * 1024 * 1024,
            image_body: 64 * 1024 * 1024,
            json_body: 64 * 1024,
        }
    }
}

/// ERROR RESPONSE FOR THE IMAGE HANDLERS: A STATUS AND A PLAIN-TEXT MESSAGE.
#[derive(Debug)]
pub struct ApiError(pub StatusCode, pub String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, self.1).into_response()
    }
}

impl From<IntakeError> for ApiError {
    fn from(e: IntakeError) -> Self {
        Self(e.status(), e.to_string())
    }
}

/// A BODY-LIMIT HIT SURFACES HERE AS 413; A BROKEN UPLOAD AS 400.
impl From<MultipartError> for ApiError {
    fn from(e: MultipartError) -> Self {
        Self(e.status(), e.body_text())
    }
}

impl From<(StatusCode, String)> for ApiError {
    fn from((status, message): (StatusCode, String)) -> Self {
        Self(status, message)
    }
}

/// LOCKS ONE MODEL, RECOVERING FROM A POISONED LOCK (A REQUEST PANICKED WHILE HOLDING IT). THE
/// MODEL MAY BE HALF-UPDATED THEN, SO THE ENGINE IS MARKED SUSPECT AND REBUILT IN THE BACKGROUND;
/// THIS REQUEST STILL GETS THE CURRENT MODEL RATHER THAN FAILING FOREVER.
fn lock_model<'a, T>(state: &AppState, model: &'a Mutex<T>) -> MutexGuard<'a, T> {
    let (guard, was_poisoned) = lock_recover(model);
    if was_poisoned {
        tracing::error!("a model lock was poisoned by a panicked request; rebuilding the engine");
        if !state.engine_suspect.swap(true, Ordering::SeqCst) {
            schedule_engine_reload(state);
        }
    }
    guard
}

/// REBUILDS THE ENGINE (ALL ONNX SESSIONS) ON THE BLOCKING POOL. USED BY DEVICE SWITCHES AND AFTER A
/// PANIC. ONLY THE LATEST GENERATION MAY CLEAR `reloading`, SO AN OVERLAPPED, STALE RELOAD NEVER
/// REPORTS READY WHILE A NEWER ONE IS STILL LOADING MODELS.
fn schedule_engine_reload(state: &AppState) {
    let engine = state.engine.clone();
    let reloading = state.reloading.clone();
    let reload_gen = state.reload_gen.clone();
    let suspect = state.engine_suspect.clone();
    let models_dir = state.models_dir.clone();

    let my_gen = reload_gen.fetch_add(1, Ordering::SeqCst) + 1;
    reloading.store(true, Ordering::SeqCst);

    tokio::task::spawn_blocking(move || {
        // ONE MODEL AT A TIME: THE OLD ONE IS DROPPED BEFORE THE NEW ONE LOADS (FEAT-004 F2)
        engine.reload(models_dir.as_path());
        suspect.store(false, Ordering::SeqCst);
        if reload_gen.load(Ordering::SeqCst) == my_gen {
            reloading.store(false, Ordering::SeqCst);
        }
    });
}

/// OUTERMOST LAYER: A PANIC IN ANY HANDLER BECOMES ONE 500 RESPONSE INSTEAD OF A DEAD CONNECTION
/// (OR, WITH panic = "abort", A DEAD PROCESS).
fn handle_panic(payload: Box<dyn std::any::Any + Send + 'static>) -> Response {
    let detail = payload
        .downcast_ref::<String>()
        .map(String::as_str)
        .or_else(|| payload.downcast_ref::<&str>().copied())
        .unwrap_or("non-string panic payload");
    tracing::error!("request handler panicked: {detail}");
    (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "internal error" }))).into_response()
}

/// RUNS CPU-HEAVY WORK (DECODE, STITCH, ENCODE, INFERENCE) ON TOKIO'S BLOCKING POOL SO THE ASYNC
/// WORKERS STAY FREE TO ANSWER /health, STATUS POLLS AND CANCELS WHILE IT RUNS.
async fn run_blocking<T, F>(f: F) -> Result<T, ApiError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, ApiError> + Send + 'static,
{
    match tokio::task::spawn_blocking(f).await {
        Ok(result) => result,
        Err(e) if e.is_panic() => {
            tracing::error!("blocking task panicked: {e}");
            Err(ApiError(StatusCode::INTERNAL_SERVER_ERROR, "internal error, the request panicked".to_string()))
        }
        Err(_) => Err(ApiError(StatusCode::SERVICE_UNAVAILABLE, "the server is shutting down".to_string())),
    }
}

pub fn create_router(state: AppState) -> Router {
    create_router_with_limits(state, RouteLimits::default())
}

pub fn create_router_with_limits(state: AppState, limits: RouteLimits) -> Router {
    let json_limit = DefaultBodyLimit::max(limits.json_body);
    let image_limit = DefaultBodyLimit::max(limits.image_body);
    Router::new()
        .route("/health", get(move |state: State<AppState>| health_handler(state, limits)))
        .route("/system/hardware", get(hardware_get_handler))
        .route("/system/device", post(hardware_set_handler).layer(json_limit))
        .route("/system/telemetry", get(telemetry_get_handler))
        .route("/pages/analyze", post(analyze_handler).layer(image_limit))
        .route("/pages/clean", post(clean_handler).layer(image_limit))
        .route("/pages/preprocess", post(preprocess_handler).layer(image_limit))
        .route("/pages/stitch", post(stitch_handler).layer(DefaultBodyLimit::max(limits.stitch_body)))
        .route("/pages/reslice", post(reslice_handler).layer(DefaultBodyLimit::max(limits.reslice_body)))
        .route("/pages/reslice/status", get(reslice_status_handler))
        .route("/pages/reslice/reset", post(reslice_reset_handler).layer(json_limit))
        .route("/pages/reslice/cancel", post(reslice_cancel_handler).layer(json_limit))
        // NO CORS: ONLY THE LOCAL NODE SERVER TALKS TO THIS API
        .layer(middleware::from_fn_with_state(state.clone(), ml_guard))
        .layer(tower_http::catch_panic::CatchPanicLayer::custom(handle_panic))
        .with_state(state)
}

async fn health_handler(State(state): State<AppState>, route_limits: RouteLimits) -> Json<serde_json::Value> {
    let hw = get_hardware_status();
    // EACH MODEL IS PROBED ON ITS OWN LOCK, NEVER WAITING FOR A RUNNING JOB
    let (detector, inpainter) = if state.engine.is_poisoned() {
        // A PANICKED REQUEST LEFT THE ENGINE SUSPECT; IT IS BEING REBUILT
        ("reloading", "reloading")
    } else {
        let detector = match state.engine.detector.try_lock() {
            Ok(d) => d.as_ref().map(|d| d.backend_name()).unwrap_or("rapidocr-fallback"),
            Err(TryLockError::Poisoned(_)) => "reloading",
            // BUSY WITH A JOB: REPORT THE USUAL BACKEND WITHOUT WAITING
            Err(TryLockError::WouldBlock) => "rapidocr",
        };
        let inpainter = match state.engine.inpainter.try_lock() {
            Ok(i) => if i.is_some() { "lama-onnx" } else { "unsupported" },
            Err(TryLockError::Poisoned(_)) => "reloading",
            Err(TryLockError::WouldBlock) => "lama-onnx",
        };
        (detector, inpainter)
    };

    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "app_version": crate::server::web_assets::APP_VERSION,
        "web_build_hash": crate::server::web_assets::WEB_BUILD_HASH,
        "web_build_time": crate::server::web_assets::WEB_BUILD_TIME,
        "accelerator": hw.device_label,
        "providers": hw.providers,
        "detector": detector,
        "inpainter": inpainter,
        "ocr": "rapidocr",
        "models_dir": state.models_dir.display().to_string(),
        "engine_suspect": state.engine_suspect.load(Ordering::SeqCst),
        // LETS THE WEB REFUSE AN OVERSIZED RESLICE BEFORE UPLOADING IT
        "limits": {
            "max_image_pixels": state.limits.max_image_pixels,
            "max_images": state.limits.max_images,
            "max_canvas_pixels": state.limits.max_canvas_pixels,
            "reslice_body_bytes": route_limits.reslice_body,
        }
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
    schedule_engine_reload(&state);

    status.reloading = true;
    Json(status)
}

async fn analyze_handler(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<AnalyzeResponse>, ApiError> {
    let mut image_bytes = None;
    let mut source_lang = None;
    let mut target_lang = None;
    let mut inpaint_padding_pct = None;
    let mut enable_typeset_centering = None;
    let mut allow_degraded_fallback = None;

    // A BROKEN OR OVERSIZED UPLOAD FAILS THE REQUEST (NEVER A SILENTLY MISSING FIELD)
    while let Some(field) = multipart.next_field().await? {
        let name = field.name().unwrap_or_default().to_string();
        if name == "image" || name == "file" {
            let bytes = field.bytes().await?;
            if !bytes.is_empty() {
                image_bytes = Some(bytes);
            }
        } else if name == "source_lang" || name == "sourceLang" || name == "src_lan" || name == "src_lang" {
            let text = field.text().await?;
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                source_lang = Some(trimmed.to_string());
            }
        } else if name == "target_lang" || name == "targetLang" || name == "tgt_lan" || name == "tgt_lang" {
            let text = field.text().await?;
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                target_lang = Some(trimmed.to_string());
            }
        } else if name == "inpaint_padding_pct" || name == "inpaintPaddingPct" {
            let text = field.text().await?;
            if let Ok(val) = text.trim().parse::<f32>() {
                inpaint_padding_pct = Some(val);
            }
        } else if name == "enable_typeset_centering" || name == "enableTypesetCentering" {
            let trimmed = field.text().await?.trim().to_lowercase();
            enable_typeset_centering = Some(trimmed == "true" || trimmed == "1");
        } else if name == "allow_degraded_fallback" || name == "allowDegradedFallback" {
            let trimmed = field.text().await?.trim().to_lowercase();
            allow_degraded_fallback = Some(trimmed == "true" || trimmed == "1");
        } else if image_bytes.is_none() && name.is_empty() {
            let bytes = field.bytes().await?;
            if !bytes.is_empty() {
                image_bytes = Some(bytes);
            }
        }
    }

    let bytes = match image_bytes {
        Some(b) => b,
        None => return Err(ApiError(StatusCode::BAD_REQUEST, "Missing image field in multipart upload".to_string())),
    };

    let options = AnalyzeOptions {
        source_lang,
        target_lang,
        inpaint_padding_pct,
        enable_typeset_centering,
        allow_degraded_fallback,
    };

    let t_req_start = std::time::Instant::now();
    let job_state = state.clone();
    let limits = state.limits.clone();
    QUEUED_OCR_JOBS.fetch_add(1, Ordering::SeqCst);
    let mut res = run_blocking(move || -> Result<AnalyzeResponse, ApiError> {
        // DECODE BEFORE TAKING THE ENGINE LOCK SO DECODING NEVER SERIALIZES BEHIND INFERENCE
        let img = match decode_image_limited(&bytes, 0, &limits) {
            Ok(img) => img,
            Err(e) => {
                QUEUED_OCR_JOBS.fetch_sub(1, Ordering::SeqCst);
                return Err(e.into());
            }
        };
        // LOCK ORDER: detector, THEN ocr. queue_wait_ms COVERS THE WAIT FOR BOTH.
        let t_lock_start = std::time::Instant::now();
        let mut detector = lock_model(&job_state, &job_state.engine.detector);
        let mut ocr = lock_model(&job_state, &job_state.engine.ocr);
        let lock_wait_ms = t_lock_start.elapsed().as_secs_f64() * 1000.0;
        QUEUED_OCR_JOBS.fetch_sub(1, Ordering::SeqCst);
        ACTIVE_OCR_JOBS.fetch_add(1, Ordering::SeqCst);

        let t_total_start = std::time::Instant::now();
        let fusion = crate::pipeline::fusion::fuse_detections(
            &mut detector,
            &mut ocr,
            &img,
            options.source_lang.as_deref(),
            options.allow_degraded_fallback.unwrap_or(false),
        );
        // THE DETECTOR IS FREE AGAIN BEFORE STAGES 2 AND 3, WHICH NEED ONLY THE OCR ENGINE
        drop(detector);
        let analyze_res = fusion.and_then(|f| crate::pipeline::analyzer::analyze_with_ocr(&mut ocr, &img, &f, Some(&options), t_total_start));
        drop(ocr);
        ACTIVE_OCR_JOBS.fetch_sub(1, Ordering::SeqCst);

        let mut analyzed = analyze_res
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Analysis pipeline error: {}", e)))?;
        if let Some(ref mut st) = analyzed.stats {
            st.queue_wait_ms = Some(lock_wait_ms);
        }
        Ok(analyzed)
    })
    .await?;

    if let Some(ref mut st) = res.stats {
        st.server_request_time_ms = Some(t_req_start.elapsed().as_secs_f64() * 1000.0);
    }

    schedule_idle_memory_trim();
    Ok(Json(res))
}

async fn clean_handler(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Response, ApiError> {
    let mut image_bytes = None;
    let mut regions_json = None;
    let mut inpaint_mode = "patch".to_string();
    let mut enable_white_inpaint = true;

    while let Some(field) = multipart.next_field().await? {
        let name = field.name().unwrap_or_default().to_string();
        if name == "image" || name == "file" {
            image_bytes = Some(field.bytes().await?);
        } else if name == "regions" {
            regions_json = Some(field.text().await?);
        } else if name == "inpaint_mode" || name == "mode" {
            let text = field.text().await?;
            if !text.trim().is_empty() {
                inpaint_mode = text.trim().to_string();
            }
        } else if name == "enable_white_inpaint" || name == "white_inpaint" {
            let text = field.text().await?;
            let t = text.trim();
            enable_white_inpaint = t != "false" && t != "0";
        }
    }

    let bytes = match image_bytes {
        Some(b) => b,
        None => return Err(ApiError(StatusCode::BAD_REQUEST, "Missing image field in multipart upload".to_string())),
    };

    let regions: Vec<CleanRequestRegion> = if let Some(raw_json) = regions_json {
        serde_json::from_str(&raw_json).unwrap_or_default()
    } else {
        Vec::new()
    };

    let job_state = state.clone();
    let limits = state.limits.clone();
    let out_bytes = run_blocking(move || -> Result<Vec<u8>, ApiError> {
        let img = decode_image_limited(&bytes, 0, &limits)?;
        // ONLY THE INPAINTER: A CLEAN NO LONGER WAITS BEHIND AN ANALYZE OR A RESLICE (FEAT-004 PHASE 10)
        let mut inpainter = lock_model(&job_state, &job_state.engine.inpainter);
        let cleaned = crate::pipeline::cleaner::clean_image(&mut inpainter, &img, &regions, &inpaint_mode, enable_white_inpaint)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Inpainting failed: {}", e)))?;

        let mut out_bytes = std::io::Cursor::new(Vec::new());
        cleaned.write_to(&mut out_bytes, image::ImageFormat::WebP)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("WebP encode failed: {}", e)))?;
        Ok(out_bytes.into_inner())
    })
    .await?;

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
) -> Result<Response, ApiError> {
    let mut image_bytes = None;

    while let Some(field) = multipart.next_field().await? {
        let name = field.name().unwrap_or_default().to_string();
        if name == "image" || name == "file" || name.is_empty() {
            image_bytes = Some(field.bytes().await?);
            break;
        }
    }

    let bytes = match image_bytes {
        Some(b) => b,
        None => return Err(ApiError(StatusCode::BAD_REQUEST, "Missing image field".to_string())),
    };

    let limits = state.limits.clone();
    let out_bytes = run_blocking(move || {
        let img = decode_image_limited(&bytes, 0, &limits)?;
        let mut out_bytes = std::io::Cursor::new(Vec::new());
        img.write_to(&mut out_bytes, image::ImageFormat::WebP)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("WebP encode failed: {}", e)))?;
        Ok(out_bytes.into_inner())
    })
    .await?;

    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "image/webp")],
        out_bytes,
    ).into_response())
}

async fn stitch_handler(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Response, ApiError> {
    let mut top_bytes = None;
    let mut bot_bytes = None;

    while let Some(field) = multipart.next_field().await? {
        let name = field.name().unwrap_or_default().to_string();
        if name == "image_top" {
            top_bytes = Some(field.bytes().await?);
        } else if name == "image_bottom" {
            bot_bytes = Some(field.bytes().await?);
        }
    }

    let t_bytes = top_bytes.ok_or_else(|| ApiError(StatusCode::BAD_REQUEST, "Missing image_top".to_string()))?;
    let b_bytes = bot_bytes.ok_or_else(|| ApiError(StatusCode::BAD_REQUEST, "Missing image_bottom".to_string()))?;

    let limits = state.limits.clone();
    let out_bytes = run_blocking(move || {
        // BOTH HEADERS AND THE COMBINED CANVAS ARE CHECKED BEFORE EITHER IMAGE IS DECODED
        let images = decode_for_canvas(&[t_bytes, b_bytes], &limits)?;
        let stitched = stitch_images_vertically(&images, &limits)?;
        let mut out_bytes = std::io::Cursor::new(Vec::new());
        stitched.write_to(&mut out_bytes, image::ImageFormat::WebP)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        Ok(out_bytes.into_inner())
    })
    .await?;

    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "image/webp")],
        out_bytes,
    ).into_response())
}

async fn reslice_handler(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Response, ApiError> {
    // RESOLVE THIS RUN'S ID: THE WEB SENDS THE ID IT RECEIVED FROM
    // `/pages/reslice/reset` SO PROGRESS FRAMES & CANCELS MATCH THE RIGHT RUN.
    // FALL BACK TO THE CURRENT COUNTER WHEN THE FIELD IS ABSENT.
    let mut run_id = state.reslice_progress.run.load(Ordering::Relaxed);
    let mut parts: Vec<Bytes> = Vec::new();

    // OPTIONAL HEIGHT TUNING FIELDS (PAGE-HEIGHT PRESET FROM THE WEB UI). DEFAULTS
    // (1600/1200/2000) BALANCE NATURAL MANGA / WEBTOON PROPORTIONS AND OCR DETECTION QUALITY.
    let mut target_height = 1600_u32;
    let mut min_height = 1200_u32;
    let mut max_height = 2000_u32;

    // STRICT: A TRUNCATED OR OVERSIZED UPLOAD FAILS THE WHOLE REQUEST, SO A RESLICE NEVER RUNS
    // ON (AND REPLACES THE CHAPTER WITH) A PARTIAL SET OF PAGES.
    while let Some(field) = multipart.next_field().await? {
        match field.name() {
            Some("run") => {
                if let Ok(parsed) = field.text().await?.trim().parse::<u64>() {
                    run_id = parsed;
                }
            }
            Some("target_height") => {
                if let Ok(parsed) = field.text().await?.trim().parse::<u32>() {
                    target_height = parsed;
                }
            }
            Some("min_height") => {
                if let Ok(parsed) = field.text().await?.trim().parse::<u32>() {
                    min_height = parsed;
                }
            }
            Some("max_height") => {
                if let Ok(parsed) = field.text().await?.trim().parse::<u32>() {
                    max_height = parsed;
                }
            }
            _ => {
                if parts.len() >= state.limits.max_images {
                    let max = state.limits.max_images;
                    return Err(IntakeError::TooManyImages { count: parts.len() + 1, max }.into());
                }
                parts.push(field.bytes().await?);
            }
        }
    }

    if parts.is_empty() {
        return Err(ApiError(StatusCode::BAD_REQUEST, "No images in upload".to_string()));
    }

    // PROBE EVERY HEADER AND PLAN THE CANVAS BEFORE DECODING ANYTHING; ANY BAD PART FAILS THE RUN.
    validate_heights(target_height, min_height, max_height)?;
    let limits = state.limits.clone();
    let images = run_blocking(move || Ok(decode_for_canvas(&parts, &limits)?)).await?;

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
        return Err(ApiError(StatusCode::BAD_REQUEST, "Reslice cancelled.".to_string()));
    }

    let cancelled_flag = state.reslice_progress.cancelled_run.clone();
    let job_state = state.clone();
    let progress_lock = state.reslice_progress.current.clone();
    let cancelled_flag_clone = cancelled_flag.clone();
    let limits = state.limits.clone();
    // THE ENGINE GUARD LIVES ONLY INSIDE THIS CLOSURE, SO IT IS RELEASED BEFORE ENCODING AND THE
    // NEXT JOB CAN TAKE THE ENGINE WHILE THIS ONE ENCODES.
    let slices = run_blocking(move || -> Result<Vec<DynamicImage>, ApiError> {
        // NO MODEL LOCK FOR THE WHOLE CHAPTER: THE SHARED ENGINE LOCKS PER DETECTION WINDOW (FEAT-004 PHASE 10)
        let mut models: &SharedEngine = &job_state.engine;
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
        smart_reslice_chapter_with_models(
            &images,
            target_height,
            min_height,
            max_height,
            &mut models,
            Some(progress_cb),
            Some(&cancelled_flag_clone),
            run_id,
            &limits,
        )
        .map_err(ApiError::from)
    })
    .await?;

    // CANCELLED BY THE CLIENT — BAIL BEFORE ENCODING. NO TERMINAL `done` FRAME:
    // THIS RUN'S POLLER IS GONE AND A NEWER RUN MAY ALREADY OWN THE FRAME.
    if state.reslice_progress.cancelled_run.load(Ordering::Relaxed) == run_id {
        return Err(ApiError(StatusCode::BAD_REQUEST, "Reslice cancelled.".to_string()));
    }

    // PHASE D (90..=99%): PARALLEL MULTI-CORE WEBP ENCODING VIA RAYON. REPORT
    // PER-PAGE PROGRESS SO THE BAR KEEPS MOVING WHILE PAGES ARE ENCODED.
    let slice_count = slices.len();
    let encode_progress = state.reslice_progress.current.clone();
    let zip_bytes = run_blocking(move || -> Result<Vec<u8>, ApiError> {
        let total_slices = slices.len().max(1) as f32;
        let encoded_counter = std::sync::atomic::AtomicU32::new(0);
        let encoded_slices: Vec<(usize, Vec<u8>)> = slices
            .par_iter()
            .enumerate()
            .map(|(idx, slice)| -> Result<(usize, Vec<u8>), ApiError> {
                let mut webp_buf = std::io::Cursor::new(Vec::new());
                slice.write_to(&mut webp_buf, image::ImageFormat::WebP).map_err(|e| {
                    ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("WebP encode of slice {idx} failed: {e}"))
                })?;
                if webp_buf.get_ref().is_empty() {
                    return Err(ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("WebP encode of slice {idx} was empty")));
                }
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
                Ok((idx, webp_buf.into_inner()))
            })
            .collect::<Result<_, _>>()?;
        drop(slices);

        // CREATE IN-MEMORY ZIP ARCHIVE
        let mut zip_buffer = std::io::Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut zip_buffer);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);

            use std::io::Write;
            let zip_err = |e: &dyn std::fmt::Display| {
                ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("ZIP write failed: {e}"))
            };
            for (idx, webp_bytes) in &encoded_slices {
                zip.start_file(format!("{}.webp", idx), options).map_err(|e| zip_err(&e))?;
                zip.write_all(webp_bytes).map_err(|e| zip_err(&e))?;
            }
            zip.finish().map_err(|e| zip_err(&e))?;
        }
        Ok(zip_buffer.into_inner())
    })
    .await?;

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
            (header::HeaderName::from_static("x-slice-count"), &slice_count.to_string()),
        ],
        zip_bytes,
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

