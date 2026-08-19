use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use colored::Colorize;
use tracing_subscriber::EnvFilter;

use xianscan_rust::ml::device::get_hardware_status;
use xianscan_rust::pipeline::PipelineEngine;
use xianscan_rust::server::router::{create_router, AppState};
use xianscan_rust::server::ssr::SsrServer;
use xianscan_rust::server::web_assets;

/// ANIMATED CLI SPINNER FOR LONG RUNNING INITIALIZATION TASKS
struct CliSpinner {
    stop_signal: Arc<AtomicBool>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl CliSpinner {
    fn start(message: &'static str) -> Self {
        let stop_signal = Arc::new(AtomicBool::new(false));
        let stop_clone = stop_signal.clone();
        let handle = std::thread::spawn(move || {
            let frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
            let mut idx = 0;
            while !stop_clone.load(Ordering::Relaxed) {
                let frame = frames[idx % frames.len()];
                print!("\r    {}  {}", frame.cyan().bold(), message.bright_cyan());
                let _ = std::io::stdout().flush();
                std::thread::sleep(Duration::from_millis(80));
                idx += 1;
            }
            // CLEAR THE SPINNER LINE CLEANLY
            print!("\r{:80}\r", "");
            let _ = std::io::stdout().flush();
        });
        Self {
            stop_signal,
            handle: Some(handle),
        }
    }

    fn stop(mut self) {
        self.stop_signal.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

/// CLEAN AND CANONICALIZE A PATH FOR FRIENDLY CONSOLE DISPLAY
fn clean_path(p: &std::path::Path) -> String {
    let s = p
        .canonicalize()
        .unwrap_or_else(|_| p.to_path_buf())
        .display()
        .to_string();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

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

/// Enable ANSI escape-sequence support on the Windows legacy console.
///
/// Unix terminals (Linux/macOS) and modern Windows Terminal handle ANSI natively;
/// however the classic `conhost.exe` console needs `ENABLE_VIRTUAL_TERMINAL_PROCESSING`
/// set on the output handle before it will render colors. This is a no-op on
/// non-Windows platforms.
fn enable_ansi_support() {
    #[cfg(windows)]
    {
        use windows::Win32::System::Console::{
            GetConsoleMode, GetStdHandle, SetConsoleMode, CONSOLE_MODE,
            ENABLE_VIRTUAL_TERMINAL_PROCESSING, STD_OUTPUT_HANDLE,
        };

        unsafe {
            if let Ok(handle) = GetStdHandle(STD_OUTPUT_HANDLE) {
                let mut mode = CONSOLE_MODE(0u32);
                if GetConsoleMode(handle, &mut mode).is_ok() {
                    let _ = SetConsoleMode(handle, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
                }
            }
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    enable_ansi_support();

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

    // Always route data storage and SQLite to the system AppData data directory
    let data_dir = web_assets::get_data_dir();
    let _ = std::fs::create_dir_all(&data_dir);
    let proper_db = data_dir.join("xianscan.db");
    let legacy_db = data_dir.join("manua.db");
    if !proper_db.exists() && legacy_db.exists() {
        let _ = std::fs::rename(&legacy_db, &proper_db);
        let _ = std::fs::rename(data_dir.join("manua.db-wal"), data_dir.join("xianscan.db-wal"));
        let _ = std::fs::rename(data_dir.join("manua.db-shm"), data_dir.join("xianscan.db-shm"));
    }

    if std::env::var("DATA_ROOT").is_err() {
        std::env::set_var("DATA_ROOT", data_dir.to_string_lossy().as_ref());
    }
    if std::env::var("DATABASE_PATH").is_err() {
        std::env::set_var(
            "DATABASE_PATH",
            proper_db.to_string_lossy().as_ref(),
        );
    }

    // RESOLVE WEB DIR: PREFER EMBEDDED EXTRACTION → ON-DISK FALLBACK.
    let web_dir = embedded_app_dir.or_else(find_web_dir);
    let hw = get_hardware_status();

    // -----------------------------------------------------------------------
    // FRIENDLY STARTUP BANNER (COLORIZED WITH RICH UNICODE BOX VISUALS)
    // -----------------------------------------------------------------------
    println!();
    println!("  ╭{}", "────────────────────────────────────────────────────────────────────────".cyan().dimmed());
    println!(
        "  │  {}  {}  {}",
        "🏮".bright_yellow(),
        "XIANSCAN".bold().bright_white(),
        "— NATIVE COMIC TRANSLATION & TYPESETTING STUDIO".cyan()
    );
    println!("  ╰{}", "────────────────────────────────────────────────────────────────────────".cyan().dimmed());
    println!();

    println!("  {}", "◆ SYSTEM & ENVIRONMENT".bold().bright_white());
    println!(
        "    {}  Hardware    : {}",
        "•".cyan(),
        hw.device_label.bold().bright_white()
    );
    if let Some(w) = &hw.gpu_warning {
        println!("    {}  Notice      : {}", "⚠".bright_yellow(), w.bright_yellow());
    }
    println!(
        "    {}  Version     : {} {}",
        "•".cyan(),
        format!("v{}", env!("CARGO_PKG_VERSION")).bright_green().bold(),
        format!("(web hash: {})", web_assets::WEB_BUILD_HASH).dimmed()
    );
    println!(
        "    {}  Models Path : {}",
        "•".cyan(),
        clean_path(&models_dir).dimmed()
    );
    println!(
        "    {}  Repository  : {}",
        "•".cyan(),
        "https://github.com/ArbenApura/xianscan-rust".bright_cyan().underline()
    );
    println!(
        "    {}  User Guide  : {}",
        "•".cyan(),
        "https://github.com/ArbenApura/xianscan-rust#quick-start".bright_cyan().underline()
    );
    println!();

    // -----------------------------------------------------------------------
    // LOAD ML MODELS WITH ANIMATED CLI SPINNER
    // -----------------------------------------------------------------------
    println!("  {}", "◆ AI INFERENCE PIPELINE".bold().bright_white());
    let spinner = CliSpinner::start("Initializing neural networks & loading ONNX model weights...");
    let engine = PipelineEngine::new(&models_dir);
    spinner.stop();
    println!(
        "    {}  Text Detector  — {}",
        if engine.detector.is_some() { "✓".bright_green().bold() } else { "✗".bright_red().bold() },
        if engine.detector.is_some() {
            if models_dir.join("comic_text_and_bubble_detector.onnx").exists() { "RT-DETR Bubble & Text Detector (disk)".white() } else { "RT-DETR Bubble & Text Detector (embedded)".white() }
        } else { "missing weights".bright_red() }
    );
    println!(
        "    {}  OCR Engine     — {}",
        if engine.ocr.is_some() { "✓".bright_green().bold() } else { "✗".bright_red().bold() },
        if engine.ocr.is_some() {
            if models_dir.join("PP-OCRv6_rec_small.onnx").exists() { "RapidOCR / PP-OCRv4 Multi-language (disk)".white() } else { "RapidOCR / PP-OCRv4 Multi-language (embedded)".white() }
        } else { "missing weights".bright_red() }
    );
    println!(
        "    {}  Inpainter      — {}",
        if engine.inpainter.is_some() { "✓".bright_green().bold() } else { "✗".bright_red().bold() },
        if engine.inpainter.is_some() {
            if models_dir.join("lama.onnx").exists() { "LaMa Large-Mask Cleanup Engine (disk)".white() } else { "LaMa Large-Mask Cleanup Engine (embedded)".white() }
        } else { "missing weights".bright_red() }
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

    let args: Vec<String> = std::env::args().collect();
    let is_dev_mode = args.iter().any(|arg| arg == "--dev" || arg == "-d")
        || std::env::var("DEV_MODE").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
    let ml_only = args.iter().any(|arg| arg == "--ml-only" || arg == "-m")
        || std::env::var("NO_SSR").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false)
        || std::env::var("ML_ONLY").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);

    // Start Web Engine
    let mut _ssr_guard = None;
    if ml_only {
        println!(
            "    {}  Web Engine     — {}",
            "•".cyan(),
            "Disabled (--ml-only active; connect external Vite server)".dimmed()
        );
    } else if is_dev_mode {
        if let Some(ref w_dir) = web_dir {
            match SsrServer::start_vite_dev(w_dir, web_port, ml_port) {
                Ok(server) => {
                    println!(
                        "    {}  Web Engine     — {}",
                        "✓".bright_green().bold(),
                        format!("Vite Live Dev HMR (port {})", web_port).bright_white()
                    );
                    _ssr_guard = Some(server);
                }
                Err(e) => {
                    println!(
                        "    {}  Web Engine     — {}",
                        "✗".bright_red().bold(),
                        format!("Failed to start Vite dev server: {}", e).bright_red()
                    );
                }
            }
        } else {
            println!(
                "    {}  Web Engine     — {}",
                "✗".bright_red().bold(),
                "Web directory not found for dev server.".bright_red()
            );
        }
    } else if let Some(ref w_dir) = web_dir {
        match SsrServer::start(w_dir, web_port, ml_port) {
            Ok(server) => {
                println!(
                    "    {}  Web Engine     — {}",
                    "✓".bright_green().bold(),
                    format!("SvelteKit SSR (Active on port {}, build {})", web_port, web_assets::WEB_BUILD_HASH).bright_white()
                );
                _ssr_guard = Some(server);
            }
            Err(e) => {
                println!(
                    "    {}  Web Engine     — {}",
                    "✗".bright_red().bold(),
                    format!("Failed to start SSR: {}", e).bright_red()
                );
            }
        }
    } else {
        println!(
            "    {}  Web Engine     — {}",
            "✗".bright_red().bold(),
            "Web directory not found; running ML API standalone.".bright_red()
        );
    }

    println!();
    println!("  {}", "◆ SERVER CONNECTIVITY & ENDPOINTS".bold().bright_white());
    let lan_ip = get_local_network_ip();
    if ml_only {
        println!("    {}  {}", "🚀".bright_green(), "ML Backend service is online!".bold().bright_green());
        println!();
        println!("        {} ML Sidecar API   : {}", "•".cyan(), format!("http://127.0.0.1:{}", ml_port).bright_cyan().bold().underline());
        println!("        {} Web UI (Dev)     : {}", "•".cyan(), format!("http://localhost:{}", web_port).bright_cyan().underline());
        println!("        {} Health API       : {}", "•".cyan(), format!("http://127.0.0.1:{}/health", ml_port).bright_cyan().underline());
        println!("                           {}", "(run 'cd web && yarn dev' in another terminal)".dimmed());
    } else if is_dev_mode {
        println!("    {}  {}", "🚀".bright_green(), "XianScan is running (Dev Mode: ML + Vite HMR)!".bold().bright_green());
        println!();
        println!("        {} Web UI (Local)   : {}", "•".cyan(), format!("http://localhost:{}", web_port).bright_cyan().bold().underline());
        if let Some(ip) = lan_ip {
            println!("        {} Network / LAN    : {}", "•".cyan(), format!("http://{}:{}", ip, web_port).bright_cyan().bold().underline());
        }
        println!("        {} ML Backend API   : {}", "•".cyan(), format!("http://127.0.0.1:{}", ml_port).bright_cyan().underline());
        println!("        {} Health API       : {}", "•".cyan(), format!("http://127.0.0.1:{}/health", ml_port).bright_cyan().underline());
    } else {
        println!("    {}  {}", "🚀".bright_green(), "XianScan Native Studio is online & ready!".bold().bright_green());
        println!();
        println!("        {} Web Studio       : {}", "•".cyan(), format!("http://localhost:{}", web_port).bright_cyan().bold().underline());
        if let Some(ip) = lan_ip {
            println!("        {} Network / LAN    : {}", "•".cyan(), format!("http://{}:{}", ip, web_port).bright_cyan().bold().underline());
        }
        println!("        {} ML Engine API    : {}", "•".cyan(), format!("http://127.0.0.1:{}", ml_port).bright_cyan().underline());
        println!("        {} Health API       : {}", "•".cyan(), format!("http://127.0.0.1:{}/health", ml_port).bright_cyan().underline());
    }
    println!();
    println!("  {}", "◆ QUICK START & TIPS".bold().bright_white());
    println!("    {}  {}", "👉".bright_yellow(), "Open the \"Web Studio\" link above in your browser to get started.".bold());
    println!("        {} Drag-and-drop raw comic pages or folders to create a book", "─".dimmed());
    println!("        {} Chrome Extension importer supported on port {}", "─".dimmed(), web_port);
    println!("        {} Press Ctrl+C in this terminal anytime to cleanly shut down", "─".dimmed());
    println!();

    // Await Ctrl+C signal for graceful shutdown
    tokio::signal::ctrl_c().await?;
    println!("\n  {} {}", "✓".bright_green(), "Shutting down XianScan cleanly...".dimmed());

    Ok(())
}

/// Resolve the primary local area network (LAN) IP address of the host machine.
/// Uses a connectionless UDP routing probe to determine the primary outbound interface.
fn get_local_network_ip() -> Option<std::net::IpAddr> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    let ip = addr.ip();
    if ip.is_loopback() || ip.is_unspecified() {
        None
    } else {
        Some(ip)
    }
}
