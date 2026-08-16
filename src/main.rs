use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tracing_subscriber::EnvFilter;

use xianscan_rust::ml::device::get_hardware_status;
use xianscan_rust::pipeline::PipelineEngine;
use xianscan_rust::server::router::{create_router, AppState};
use xianscan_rust::server::ssr::SsrServer;
use xianscan_rust::server::web_assets;


fn find_models_dir() -> PathBuf {
    if let Ok(env_dir) = std::env::var("MODELS_DIR") {
        let p = PathBuf::from(env_dir);
        if p.exists() {
            return p;
        }
    }

    let cwd_models = PathBuf::from("models");
    if cwd_models.exists() {
        return cwd_models;
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let next_to_exe = exe_dir.join("models");
            if next_to_exe.exists() {
                return next_to_exe;
            }

            let root_models = exe_dir.join("../..").join("models");
            if root_models.exists() {
                return root_models;
            }
        }
    }

    PathBuf::from("models")
}

fn find_web_dir() -> Option<PathBuf> {
    if let Ok(env_dir) = std::env::var("WEB_DIR") {
        let p = PathBuf::from(env_dir);
        if p.exists() {
            return Some(p);
        }
    }

    let cwd_web = PathBuf::from("web");
    if cwd_web.exists() {
        return Some(cwd_web);
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let next_to_exe = exe_dir.join("web");
            if next_to_exe.exists() {
                return Some(next_to_exe);
            }

            let root_web = exe_dir.join("../..").join("web");
            if root_web.exists() {
                return Some(root_web);
            }
        }
    }

    None
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let ml_port: u16 = std::env::var("ML_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8123);

    let web_port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8124);

    let models_dir = find_models_dir();

    // -----------------------------------------------------------------------
    // Web asset extraction (embed-web feature)
    // When the binary was compiled with --features embed-web, extract the
    // SvelteKit build + native .node addons to the user's app-data directory.
    // This runs in milliseconds on subsequent launches (VERSION stamp check).
    // -----------------------------------------------------------------------
    let embedded_app_dir = match web_assets::extract_if_needed() {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("  [!] Failed to extract embedded web assets: {}", e);
            None
        }
    };

    // Only redirect data storage to AppData when running as an embedded build
    // (i.e. embed-web compiled in AND extraction succeeded).
    // Dev builds (cargo run without --features embed-web) keep data local at
    // ./data/ so dev data stays project-local and doesn't pollute AppData.
    if let Some(ref _app_dir) = embedded_app_dir {
        let data_dir = web_assets::get_data_dir();
        if std::env::var("DATA_ROOT").is_err() {
            std::env::set_var("DATA_ROOT", data_dir.to_string_lossy().as_ref());
        }
        if std::env::var("DATABASE_PATH").is_err() {
            std::env::set_var(
                "DATABASE_PATH",
                data_dir.join("manua.db").to_string_lossy().as_ref(),
            );
        }
    }

    // Resolve web dir: prefer embedded extraction → on-disk fallback.
    let web_dir = embedded_app_dir.or_else(find_web_dir);
    let hw = get_hardware_status();


    println!();
    println!("================================================================");
    println!("  🏮 XIANSCAN-RUST -- UNIFIED NATIVE + SSR SERVER");
    println!("================================================================");
    println!("  [+] Hardware:    {}", hw.device_label);
    if let Some(w) = hw.gpu_warning {
        println!("  [!] Notice:      {}", w);
    }
    println!("  [+] Models Dir:  {}", models_dir.display());

    let engine = PipelineEngine::new(&models_dir);
    println!(
        "  [+] Detector:    {}",
        if engine.detector.is_some() {
            if models_dir.join("comictextdetector.pt.onnx").exists() { "ComicTextDetector (Disk: Ready)" } else { "ComicTextDetector (Embedded: Ready)" }
        } else { "Missing weights" }
    );
    println!(
        "  [+] OCR Engine:  {}",
        if engine.ocr.is_some() {
            if models_dir.join("PP-OCRv6_rec_small.onnx").exists() { "RapidOCR / PP-OCRv4 (Disk: Ready)" } else { "RapidOCR / PP-OCRv4 (Embedded: Ready)" }
        } else { "Missing weights" }
    );
    println!(
        "  [+] Inpainter:   {}",
        if engine.inpainter.is_some() {
            if models_dir.join("lama.onnx").exists() { "Big-LaMa ONNX (Disk: Ready)" } else { "Big-LaMa ONNX (Embedded: Ready)" }
        } else { "Missing weights" }
    );

    let state = AppState {
        engine: Arc::new(Mutex::new(engine)),
    };

    let app = create_router(state);

    let ml_addr = format!("127.0.0.1:{}", ml_port);
    let listener = match tokio::net::TcpListener::bind(&ml_addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!();
            eprintln!("  [ERROR] Failed to bind ML engine to {}: {}", ml_addr, e);
            eprintln!("================================================================");
            return Err(e.into());
        }
    };

    // Spawn ML Engine in background task
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    // Start SvelteKit SSR Web Engine
    let mut _ssr_guard = None;
    if let Some(ref w_dir) = web_dir {
        match SsrServer::start(w_dir, web_port, ml_port) {
            Ok(server) => {
                println!("  [+] Web Engine:  SvelteKit SSR (Active on port {})", web_port);
                _ssr_guard = Some(server);
            }
            Err(e) => {
                println!("  [!] Web Engine:  Failed to start SSR: {}", e);
            }
        }
    } else {
        println!("  [!] Web Engine:  Web directory not found; running ML API standalone.");
    }

    println!("================================================================");
    println!("  🚀 XianScan is running!");
    println!("     Web UI:       http://localhost:{}", web_port);
    println!("     LAN/Network:  http://0.0.0.0:{}", web_port);
    println!("     ML Backend:   http://127.0.0.1:{}", ml_port);
    println!("================================================================");
    println!("  (Press Ctrl+C to stop)");
    println!();

    // Await Ctrl+C signal for graceful shutdown
    tokio::signal::ctrl_c().await?;
    println!("\n  [+] Shutting down XianScan cleanly...");

    Ok(())
}
