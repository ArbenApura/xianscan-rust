use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use colored::Colorize;
use tracing_subscriber::EnvFilter;

use xianscan_rust::ml::device::get_hardware_status;
use xianscan_rust::ml::intake::IntakeLimits;
use xianscan_rust::pipeline::PipelineEngine;
use xianscan_rust::server::router::{create_router, AppState};
use xianscan_rust::server::access::{self, BindMode};
use xianscan_rust::server::ssr::{SpawnConfig, SsrEnv, SsrServer};
use xianscan_rust::server::web_assets;

// HIGH-PERFORMANCE LOCK-FREE MEMORY ALLOCATOR (OPTIMIZED FOR MULTI-CORE CPU WORKLOADS & RAYON)
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

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

/// ENABLE ANSI ESCAPE-SEQUENCE SUPPORT ON WINDOWS LEGACY CONSOLE.
///
/// UNIX TERMINALS (LINUX/MACOS) AND MODERN WINDOWS TERMINAL HANDLE ANSI NATIVELY;
/// HOWEVER THE CLASSIC `conhost.exe` CONSOLE NEEDS `ENABLE_VIRTUAL_TERMINAL_PROCESSING`
/// SET ON THE OUTPUT HANDLE BEFORE IT WILL RENDER COLORS. THIS IS A NO-OP ON
/// NON-WINDOWS PLATFORMS.
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

/// STARTUP VALUES COMPUTED BEFORE THE TOKIO RUNTIME EXISTS, SO THE `set_var` CALLS RUN WHILE THE
/// PROCESS IS STILL SINGLE-THREADED (SETTING ENV VARS WITH OTHER THREADS RUNNING IS UNSOUND).
struct StartupConfig {
    args: Vec<String>,
    is_dev_mode: bool,
    ml_only: bool,
    ml_port: u16,
    web_port: u16,
    models_dir: PathBuf,
    data_dir: PathBuf,
    proper_db: PathBuf,
    db_existed: bool,
}

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    enable_ansi_support();

    let args: Vec<String> = std::env::args().collect();

    // --extract-only: WRITE THE EMBEDDED WEB APP AND EXIT (THE DOCKER IMAGE RUNS THIS AT BUILD TIME, AS ROOT, INTO
    // XIANSCAN_APP_DIR). HANDLED BEFORE ANYTHING ELSE SO NO GPU PROBE, NETWORK OR DATABASE IS TOUCHED (FEAT-008 PHASE 7).
    if args.iter().any(|arg| arg == "--extract-only") {
        match web_assets::extract_if_needed() {
            Ok(Some(dir)) => {
                println!("{}", dir.display());
                return Ok(());
            }
            Ok(None) => {
                eprintln!("--extract-only needs a binary built with the embed-web feature");
                std::process::exit(2);
            }
            Err(e) => {
                eprintln!("--extract-only failed: {}", e);
                std::process::exit(1);
            }
        }
    }

    let is_dev_mode = args.iter().any(|arg| arg == "--dev" || arg == "-d")
        || std::env::var("DEV_MODE").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
    let ml_only = args.iter().any(|arg| arg == "--ml-only" || arg == "-m")
        || std::env::var("NO_SSR").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false)
        || std::env::var("ML_ONLY").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
    // --lan: LISTEN ON EVERY INTERFACE (OTHER DEVICES NEED THE ACCESS TOKEN)
    // --print-token: PRINT THE ACCESS TOKEN AND EXIT (FOR DOCKER AND HEADLESS SERVERS)
    let print_token = args.iter().any(|arg| arg == "--print-token");

    let ml_port: u16 = std::env::var("ML_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8123);

    let web_port: u16 = if is_dev_mode {
        std::env::var("DEV_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8125)
    } else {
        std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8124)
    };

    // ONE RESOLVED MODELS PATH, USED BY THE ENGINE AND BY EVERY LATER RELOAD
    let models_dir = find_models_dir();

    // ALWAYS ROUTE DATA STORAGE AND SQLITE TO THE SYSTEM APPDATA DATA DIRECTORY
    let data_dir = web_assets::get_data_dir();
    let _ = std::fs::create_dir_all(&data_dir);
    let proper_db = data_dir.join("xianscan.db");
    // RECORDED BEFORE ANYTHING CAN CREATE THE DATABASE: A PRE-EXISTING DB MARKS A LEGACY INSTALL
    let db_existed = proper_db.exists();

    if print_token {
        match access::ensure_access_token(&data_dir) {
            Some(token) => {
                println!("{}", token);
                return Ok(());
            }
            None => anyhow::bail!("could not read or create the access token in {}", data_dir.display()),
        }
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

    let cfg = StartupConfig {
        args,
        is_dev_mode,
        ml_only,
        ml_port,
        web_port,
        models_dir,
        data_dir,
        proper_db,
        db_existed,
    };
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(run(cfg))
}

async fn run(cfg: StartupConfig) -> anyhow::Result<()> {
    let StartupConfig {
        args,
        is_dev_mode,
        ml_only,
        ml_port,
        web_port,
        models_dir,
        data_dir,
        proper_db,
        db_existed,
    } = cfg;

    // SPAWNS A HELPER THREAD ON LINUX, SO IT RUNS ONLY AFTER THE ENV VARS ARE SET
    xianscan_rust::ml::device::init_linux_gpu_persistence();

    // -----------------------------------------------------------------------
    // WEB ASSET EXTRACTION (EMBED-WEB FEATURE)
    // WHEN THE BINARY WAS COMPILED WITH --FEATURES EMBED-WEB, EXTRACT THE
    // SVELTEKIT BUILD + NATIVE .NODE ADDONS TO THE USER'S APP-DATA DIRECTORY.
    // THIS RUNS IN MILLISECONDS ON SUBSEQUENT LAUNCHES (VERSION STAMP CHECK).
    // -----------------------------------------------------------------------
    let embedded_app_dir = match web_assets::extract_if_needed() {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("  [!] Failed to extract embedded web assets: {}", e);
            // A PINNED APP DIR (THE DOCKER IMAGE) THAT FAILS VERIFICATION MUST NOT FALL BACK TO SOMETHING ELSE
            if std::env::var("XIANSCAN_APP_DIR").map(|v| !v.trim().is_empty()).unwrap_or(false) {
                std::process::exit(1);
            }
            None
        }
    };

    // LOAD PERSISTED HARDWARE SETTINGS (CUDA MEMORY LIMIT, EXECUTION DEVICE) BEFORE HARDWARE PROBE & ENGINE INITIALIZATION
    xianscan_rust::ml::device::load_persisted_hardware_settings(&proper_db);

    // DECIDE WHO MAY REACH THE WEB SERVER: LOOPBACK BY DEFAULT, LAN WHEN ASKED OR FOR LEGACY INSTALLS
    let db_probe = access::probe_db(&proper_db, db_existed);
    let (bind_mode, bind_source) = access::resolve_bind_mode(
        &args,
        std::env::var("XIANSCAN_BIND").ok(),
        access::running_in_docker(),
        db_probe,
    );
    let _ = access::ensure_access_token(&data_dir);

    // SHARED SECRET BETWEEN THIS PROCESS'S ML SERVER AND ITS NODE CHILD. A FIXED ONE CAN BE SUPPLIED
    // (>= 32 CHARS) FOR SPLIT SETUPS; OTHERWISE A FRESH ONE PER RUN.
    let ml_secret = std::env::var("ML_SHARED_SECRET")
        .ok()
        .filter(|s| s.len() >= 32)
        .or_else(access::generate_secret);
    if ml_secret.is_none() {
        eprintln!("  [!] Could not generate the ML server secret; the ML API is protected by loopback checks only.");
    }
    let ml_secret_path = data_dir.join("ml-secret");
    if ml_only {
        // `yarn dev` IN ANOTHER TERMINAL READS IT FROM <DATA_ROOT>/ml-secret
        if let Some(secret) = &ml_secret {
            if let Err(e) = access::write_secret_file(&ml_secret_path, secret) {
                eprintln!("  [!] Could not write {}: {}", ml_secret_path.display(), e);
            }
        }
    }

    let spawn_config = SpawnConfig {
        port: web_port,
        ml_port,
        bind_host: bind_mode.host(),
        bind_source: bind_source.as_str(),
        token_path: access::token_path(&data_dir),
        ml_secret: ml_secret.clone(),
        env: SsrEnv {
            data_root: std::env::var_os("DATA_ROOT").map(PathBuf::from).unwrap_or_else(|| data_dir.clone()),
            database_path: std::env::var_os("DATABASE_PATH").map(PathBuf::from).unwrap_or_else(|| proper_db.clone()),
        },
    };

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
    // SILENCE ONNX RUNTIME'S NATIVE C-LOGGER (LOUD [W:...] DEVICE / EP WARNINGS
    // LIKE "Failed to detect devices", "VerifyEachNodeIsAssignedToAnEp", AND
    // "Memcpy nodes are added"). SET BEFORE THE FIRST SESSION IS CREATED. THIS
    // SUPPRESSES ONLY THE C LIBRARY'S WARNINGS; OUR OWN tracing::info! MODEL
    // LOADING MESSAGES BELOW ARE UNAFFECTED.
    // -----------------------------------------------------------------------
    if let Ok(env) = ort::environment::Environment::current() {
        env.set_log_level(ort::logging::LogLevel::Error);
    }

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
        if let Some(ref det) = engine.detector {
            format!("{} ({})", det.backend_name(), if models_dir.join("rfdetr-seg-2xlarge.onnx").exists() { "disk" } else { "embedded" }).white()
        } else { "missing weights".bright_red() }
    );
    println!(
        "    {}  OCR Engine     — {}",
        if engine.ocr.is_some() { "✓".bright_green().bold() } else { "✗".bright_red().bold() },
        if engine.ocr.is_some() {
            if models_dir.join("PP-OCRv6_rec_small.onnx").exists() { "RapidOCR Multi-language (disk)".white() } else { "RapidOCR Multi-language (embedded)".white() }
        } else { "missing weights".bright_red() }
    );
    println!(
        "    {}  Inpainter      — {}",
        if engine.inpainter.is_some() { "✓".bright_green().bold() } else { "✗".bright_red().bold() },
        if engine.inpainter.is_some() {
            if models_dir.join("lama.onnx").exists() { "LaMa Large-Mask Cleanup Engine (disk)".white() } else { "LaMa Large-Mask Cleanup Engine (embedded)".white() }
        } else { "missing weights".bright_red() }
    );

    let state = AppState::new(engine, models_dir.clone(), IntakeLimits::from_env())
        .with_security(ml_secret.clone(), ml_port);

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

    // SERVE THE ML ENGINE IN A KEPT TASK: IF IT EVER STOPS, THE PROCESS NOTICES AND EXITS NON-ZERO
    // INSTEAD OF LEAVING A WEB SERVER UP WITH NO ML BACKEND. CTRL+C LETS IN-FLIGHT REQUESTS FINISH.
    let (shutdown_tx, mut shutdown_rx) = tokio::sync::watch::channel(false);
    let mut ml_server = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.wait_for(|stop| *stop).await;
            })
            .await
    });



    // START WEB ENGINE
    let mut _ssr_guard = None;
    if ml_only {
        println!(
            "    {}  Web Engine     — {}",
            "•".cyan(),
            "Disabled (--ml-only active; connect external Vite server)".dimmed()
        );
    } else if is_dev_mode {
        if let Some(ref w_dir) = web_dir {
            match SsrServer::start_vite_dev(w_dir, spawn_config.clone()) {
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
        match SsrServer::start(w_dir, spawn_config.clone()) {
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
        println!("        {} ML Secret File   : {}", "•".cyan(), ml_secret_path.display().to_string().dimmed());
        println!("        {} Web UI (Dev)     : {}", "•".cyan(), format!("http://localhost:{}", web_port).bright_cyan().underline());
        println!("        {} Health API       : {}", "•".cyan(), format!("http://127.0.0.1:{}/health", ml_port).bright_cyan().underline());
        println!("                           {}", "(run 'cd web && yarn dev' in another terminal)".dimmed());
    } else if is_dev_mode {
        println!("    {}  {}", "🚀".bright_green(), "XianScan is running (Dev Mode: ML + Vite HMR)!".bold().bright_green());
        println!();
        println!("        {} Web UI (Local)   : {}", "•".cyan(), format!("http://localhost:{}", web_port).bright_cyan().bold().underline());
        print_lan_lines(bind_mode, lan_ip, web_port);
        println!("        {} ML Backend API   : {}", "•".cyan(), format!("http://127.0.0.1:{}", ml_port).bright_cyan().underline());
        println!("        {} Health API       : {}", "•".cyan(), format!("http://127.0.0.1:{}/health", ml_port).bright_cyan().underline());
    } else {
        println!("    {}  {}", "🚀".bright_green(), "XianScan Native Studio is online & ready!".bold().bright_green());
        println!();
        println!("        {} Web Studio       : {}", "•".cyan(), format!("http://localhost:{}", web_port).bright_cyan().bold().underline());
        print_lan_lines(bind_mode, lan_ip, web_port);
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

    // WAIT FOR A STOP SIGNAL (CTRL+C, TERMINAL CLOSE, SERVICE STOP) OR FOR THE ML SERVER TO DIE
    let ml_died = tokio::select! {
        _ = shutdown_signal() => None,
        result = &mut ml_server => Some(result),
    };

    if let Some(result) = ml_died {
        let reason = match result {
            Ok(Ok(())) => "it stopped unexpectedly".to_string(),
            Ok(Err(e)) => e.to_string(),
            Err(e) => e.to_string(),
        };
        tracing::error!("ML server on port {} stopped: {}", ml_port, reason);
        if let Some(mut server) = _ssr_guard.take() {
            server.stop();
        }
        anyhow::bail!("the ML server stopped ({reason}); XianScan is shutting down");
    }

    println!("\n  {} {}", "✓".bright_green(), "Shutting down XianScan cleanly...".dimmed());
    let _ = shutdown_tx.send(true);
    if let Some(mut server) = _ssr_guard.take() {
        server.stop();
    }
    // GIVE IN-FLIGHT ML REQUESTS A MOMENT TO FINISH, BUT NEVER HANG THE EXIT ON THEM
    let _ = tokio::time::timeout(Duration::from_secs(5), ml_server).await;

    Ok(())
}

/// RESOLVES ON THE FIRST STOP REQUEST THE PLATFORM CAN DELIVER.
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut term = signal(SignalKind::terminate()).ok();
        let mut hup = signal(SignalKind::hangup()).ok();
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = async { match term.as_mut() { Some(s) => { s.recv().await; } None => std::future::pending::<()>().await } } => {}
            _ = async { match hup.as_mut() { Some(s) => { s.recv().await; } None => std::future::pending::<()>().await } } => {}
        }
    }
    #[cfg(windows)]
    {
        use tokio::signal::windows::{ctrl_close, ctrl_shutdown};
        let mut close = ctrl_close().ok();
        let mut shutdown = ctrl_shutdown().ok();
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = async { match close.as_mut() { Some(s) => { s.recv().await; } None => std::future::pending::<()>().await } } => {}
            _ = async { match shutdown.as_mut() { Some(s) => { s.recv().await; } None => std::future::pending::<()>().await } } => {}
        }
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

/// BANNER LINES FOR LAN ACCESS. THE TOKEN ITSELF IS NEVER PRINTED HERE.
fn print_lan_lines(bind_mode: BindMode, lan_ip: Option<std::net::IpAddr>, web_port: u16) {
    if bind_mode == BindMode::Lan {
        if let Some(ip) = lan_ip {
            println!("        {} Network / LAN    : {}", "•".cyan(), format!("http://{}:{}", ip, web_port).bright_cyan().bold().underline());
        }
        println!(
            "        {} Access token     : {}",
            "•".cyan(),
            "run `xianscan --print-token` or open Settings, Network & Access on this computer".dimmed()
        );
    } else {
        println!("        {} LAN access       : {}", "•".cyan(), "off (Settings, Network & Access)".dimmed());
    }
}

/// RESOLVE THE PRIMARY LOCAL AREA NETWORK (LAN) IP ADDRESS OF THE HOST MACHINE.
/// USES A CONNECTIONLESS UDP ROUTING PROBE TO DETERMINE THE PRIMARY OUTBOUND INTERFACE.
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
