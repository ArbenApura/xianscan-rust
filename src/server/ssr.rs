// -- CRATE / EXTERNAL IMPORTS -- //
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use colored::Colorize;
use tracing::debug;

// -- TYPES & STRUCTS -- //

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ServerKind {
    Ssr,
    ViteDev,
}

pub struct SsrServer {
    child: Arc<std::sync::Mutex<Option<Child>>>,
    shutdown_signal: Arc<AtomicBool>,
    supervisor_handle: Option<tokio::task::JoinHandle<()>>,
}

// -- TRAITS & IMPLEMENTATIONS -- //

impl SsrServer {
    pub fn start(web_dir: &Path, port: u16, ml_port: u16) -> anyhow::Result<Self> {
        Self::start_internal(ServerKind::Ssr, web_dir, port, ml_port)
    }

    pub fn start_vite_dev(web_dir: &Path, port: u16, ml_port: u16) -> anyhow::Result<Self> {
        Self::start_internal(ServerKind::ViteDev, web_dir, port, ml_port)
    }

    fn start_internal(
        kind: ServerKind,
        web_dir: &Path,
        port: u16,
        ml_port: u16,
    ) -> anyhow::Result<Self> {
        let initial_child = spawn_process(kind, web_dir, port, ml_port)?;
        let child = Arc::new(std::sync::Mutex::new(Some(initial_child)));
        let shutdown_signal = Arc::new(AtomicBool::new(false));

        let child_clone = Arc::clone(&child);
        let shutdown_clone = Arc::clone(&shutdown_signal);
        let web_dir_buf = web_dir.to_path_buf();

        let supervisor_handle = tokio::spawn(async move {
            let mut consecutive_failures: u32 = 0;
            let mut last_spawn_time = std::time::Instant::now();

            loop {
                tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
                if shutdown_clone.load(Ordering::SeqCst) {
                    break;
                }

                let needs_restart = {
                    let mut guard = match child_clone.lock() {
                        Ok(g) => g,
                        Err(_) => break,
                    };
                    if let Some(ref mut c) = *guard {
                        match c.try_wait() {
                            Ok(Some(status)) => {
                                // REAP TERMINATED PROCESS TO PREVENT ZOMBIE PROCESSES
                                let _ = c.wait();
                                // REMOVE TERMINATED PROCESS FROM MUTEX TO PREVENT RE-POLLING STALE HANDLE
                                let _ = guard.take();

                                if !shutdown_clone.load(Ordering::SeqCst) {
                                    if last_spawn_time.elapsed() < std::time::Duration::from_secs(4) {
                                        consecutive_failures += 1;
                                    } else {
                                        consecutive_failures = 1;
                                    }

                                    eprintln!(
                                        "\n  {} Web Studio (port {}) exited unexpectedly (status {}).",
                                        "[!]".bright_yellow().bold(),
                                        port,
                                        status
                                    );

                                    if consecutive_failures >= 5 {
                                        eprintln!(
                                            "  {} Repeated crashes detected ({} consecutive quick exits). Pausing restart for 10s...",
                                            "[!]".bright_red().bold(),
                                            consecutive_failures
                                        );
                                    } else {
                                        eprintln!(
                                            "  {} Automatically restarting Web Studio...",
                                            "↻".bright_cyan().bold()
                                        );
                                    }
                                    true
                                } else {
                                    false
                                }
                            }
                            Ok(None) => false,
                            Err(e) => {
                                tracing::warn!("Failed to poll web child process: {}", e);
                                false
                            }
                        }
                    } else {
                        false
                    }
                };

                if needs_restart {
                    if consecutive_failures >= 5 {
                        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                        consecutive_failures = 0;
                    }

                    if shutdown_clone.load(Ordering::SeqCst) {
                        break;
                    }

                    match spawn_process(kind, &web_dir_buf, port, ml_port) {
                        Ok(mut new_child) => {
                            last_spawn_time = std::time::Instant::now();
                            if let Ok(mut guard) = child_clone.lock() {
                                if shutdown_clone.load(Ordering::SeqCst) {
                                    // TERMINATE CHILD IMMEDIATELY IF SHUTDOWN OCCURRED IN-FLIGHT OR UNDER LOCK
                                    #[cfg(windows)]
                                    {
                                        let pid = new_child.id();
                                        let _ = Command::new("taskkill")
                                            .args(["/PID", &pid.to_string(), "/T", "/F"])
                                            .stdout(Stdio::null())
                                            .stderr(Stdio::null())
                                            .status();
                                    }
                                    let _ = new_child.kill();
                                    let _ = new_child.wait();
                                    break;
                                }
                                *guard = Some(new_child);
                            } else {
                                let _ = new_child.kill();
                                let _ = new_child.wait();
                                break;
                            }
                            eprintln!(
                                "  {} Web Studio restarted and listening on port {}.\n",
                                "✓".bright_green().bold(),
                                port
                            );
                        }
                        Err(e) => {
                            consecutive_failures += 1;
                            eprintln!(
                                "  {} Failed to restart Web Studio: {}",
                                "[✗]".bright_red().bold(),
                                e
                            );
                            // BACK OFF SLIGHTLY BEFORE NEXT RESTART ATTEMPT
                            tokio::time::sleep(std::time::Duration::from_millis(3000)).await;
                        }
                    }
                }
            }
        });

        Ok(Self {
            child,
            shutdown_signal,
            supervisor_handle: Some(supervisor_handle),
        })
    }

    pub fn stop(&mut self) {
        self.shutdown_signal.store(true, Ordering::SeqCst);
        if let Some(handle) = self.supervisor_handle.take() {
            handle.abort();
        }
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                #[cfg(windows)]
                {
                    let pid = child.id();
                    let _ = Command::new("taskkill")
                        .args(["/PID", &pid.to_string(), "/T", "/F"])
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .status();
                }
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

impl Drop for SsrServer {
    fn drop(&mut self) {
        self.stop();
    }
}

// -- FUNCTIONS & ALGORITHMS -- //

fn spawn_process(
    kind: ServerKind,
    web_dir: &Path,
    port: u16,
    ml_port: u16,
) -> anyhow::Result<Child> {
    match kind {
        ServerKind::Ssr => spawn_ssr_process(web_dir, port, ml_port),
        ServerKind::ViteDev => spawn_vite_dev_process(web_dir, port, ml_port),
    }
}

fn spawn_ssr_process(web_dir: &Path, port: u16, ml_port: u16) -> anyhow::Result<Child> {
    let node_bin = find_node_binary(web_dir)?;
    let clean_web_dir = normalize_windows_path(web_dir);
    let build_index = clean_web_dir.join("build").join("index.js");

    if !build_index.exists() {
        anyhow::bail!(
            "SSR build artifact not found at {:?}. Please run 'yarn build' inside web directory.",
            build_index
        );
    }

    let mut cmd = Command::new(&node_bin);

    // RESOLVE DATA_ROOT AND DATABASE_PATH FROM ENVIRONMENT SO WE FORWARD
    // VALUES MAIN.RS ALREADY COMPUTED (APP-DATA DIR ON EMBED-WEB BUILDS, OR ./DATA FOR ON-DISK DEV BUILDS).
    let data_root = std::env::var("DATA_ROOT").unwrap_or_else(|_| "./data".to_string());
    let db_path = std::env::var("DATABASE_PATH")
        .unwrap_or_else(|_| format!("{}/xianscan.db", data_root));

    // NODE_PATH LETS NODE RESOLVE `require('better-sqlite3')` AND
    // `require('@napi-rs/canvas')` FROM EXTRACTED NODE_MODULES DIRECTORY
    // THAT LIVES INSIDE THE APP DIR (NEXT TO BUILD/).
    let node_modules = clean_web_dir.join("node_modules");
    let node_path = std::env::var("NODE_PATH")
        .map(|existing| {
            format!(
                "{}{}{}",
                node_modules.display(),
                if cfg!(windows) { ";" } else { ":" },
                existing
            )
        })
        .unwrap_or_else(|_| node_modules.display().to_string());

    // CONFIGURE 4GB HEAP CEILING TO PREVENT NATIVE SKIA / V8 OOM ON LONG RUNS
    // AND SUPPRESS NODE ENGINE DEPRECATION WARNINGS (E.G. PUNYCODE DEP0040)
    cmd.arg("--max-old-space-size=4096")
        .arg("--no-deprecation")
        .arg("build/index.js")
        .current_dir(&clean_web_dir)
        .env("PORT", port.to_string())
        .env("HOST", "0.0.0.0")
        .env("ML_BASE_URL", format!("http://127.0.0.1:{}", ml_port))
        .env("DATA_ROOT", &data_root)
        .env("DATABASE_PATH", &db_path)
        .env("NODE_PATH", &node_path)
        .env("BODY_SIZE_LIMIT", "64M")
        .stdout(if verbose_logging() {
            Stdio::inherit()
        } else {
            Stdio::null()
        })
        .stderr(Stdio::inherit());

    debug!("Starting SvelteKit SSR Engine on port {}...", port);
    let child = cmd.spawn()?;
    Ok(child)
}

fn spawn_vite_dev_process(web_dir: &Path, port: u16, ml_port: u16) -> anyhow::Result<Child> {
    let clean_web_dir = normalize_windows_path(web_dir);
    let data_root = std::env::var("DATA_ROOT").unwrap_or_else(|_| "./data".to_string());
    let db_path = std::env::var("DATABASE_PATH")
        .unwrap_or_else(|_| format!("{}/xianscan.db", data_root));

    #[cfg(windows)]
    let mut cmd = Command::new("cmd");
    #[cfg(windows)]
    cmd.args(["/C", "yarn", "dev"]);

    #[cfg(not(windows))]
    let mut cmd = Command::new("yarn");
    #[cfg(not(windows))]
    cmd.args(["dev"]);

    cmd.current_dir(&clean_web_dir)
        .env("PORT", port.to_string())
        .env("DEV_PORT", port.to_string())
        .env("HOST", "0.0.0.0")
        .env("ML_BASE_URL", format!("http://127.0.0.1:{}", ml_port))
        .env("DATA_ROOT", &data_root)
        .env("DATABASE_PATH", &db_path)
        // STREAM VITE STDOUT ONLY WHEN LOG_REQUESTS=1 QUIET BY DEFAULT SO BENIGN
        // BROWSER PROBES (E.G. /.well-known/appspecific/* CHROME DEVTOOLS) DON'T
        // CLUTTER THE CLI WITH 404 NOISE. STDERR (REAL ERRORS) IS ALWAYS SHOWN.
        .stdout(if verbose_logging() {
            Stdio::inherit()
        } else {
            Stdio::null()
        })
        .stderr(Stdio::inherit());

    debug!("Starting Vite Live Dev Server on port {}...", port);
    let child = cmd.spawn()?;
    Ok(child)
}

/// WHETHER THE SSR CHILD PROCESS SHOULD STREAM ITS STDOUT TO OURS.
/// TRUE ONLY WHEN THE USER EXPLICITLY OPTS INTO VERBOSE LOGGING.
fn verbose_logging() -> bool {
    std::env::var("LOG_REQUESTS").map(|v| v == "1").unwrap_or(false)
}

fn normalize_windows_path(path: &Path) -> PathBuf {
    let s = path.display().to_string();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

fn find_node_binary(web_dir: &Path) -> anyhow::Result<PathBuf> {
    // 1. CHECK NEXT TO WEB_DIR / PORTABLE BINARY DIRECTORY
    let local_node = web_dir.join("bin").join(if cfg!(windows) { "node.exe" } else { "node" });
    if local_node.exists() {
        return Ok(local_node);
    }

    // 2. CHECK PATH ENVIRONMENT VARIABLE
    if let Ok(path_var) = std::env::var("PATH") {
        let sep = if cfg!(windows) { ';' } else { ':' };
        let exe_name = if cfg!(windows) { "node.exe" } else { "node" };
        for dir in path_var.split(sep) {
            let candidate = Path::new(dir).join(exe_name);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }

    #[cfg(windows)]
    {
        let common_paths = [
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe",
        ];
        for p in &common_paths {
            let pb = PathBuf::from(p);
            if pb.exists() {
                return Ok(pb);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // HOMEBREW (APPLE SILICON), NVM, VOLTA, SYSTEM NODE.
        let home = std::env::var("HOME").unwrap_or_default();
        let common_paths = [
            "/opt/homebrew/bin/node",          // HOMEBREW ON APPLE SILICON (M1/M2/M3/M4)
            "/usr/local/bin/node",             // CUSTOM OR SYSTEM INSTALLS
            "/usr/bin/node",                   // SYSTEM NODE
        ];
        // NVM AND VOLTA USE HOME-RELATIVE PATHS
        let nvm_path = format!("{}/.nvm/versions/node", home);
        let volta_path = format!("{}/.volta/bin/node", home);
        let home_relative = [volta_path.as_str()];
        for p in common_paths.iter().chain(home_relative.iter()) {
            let pb = PathBuf::from(p);
            if pb.exists() {
                return Ok(pb);
            }
        }
        // NVM: SCAN ~/.nvm/versions/node/ FOR THE MOST RECENTLY INSTALLED VERSION
        if let Ok(entries) = std::fs::read_dir(&nvm_path) {
            let mut versions: Vec<_> = entries.flatten().collect();
            versions.sort_by_key(|e| e.file_name());
            if let Some(latest) = versions.last() {
                let candidate = latest.path().join("bin").join("node");
                if candidate.exists() {
                    return Ok(candidate);
                }
            }
        }
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        // LINUX AND OTHER UNIX SYSTEMS.
        let common_paths = [
            "/usr/local/bin/node",
            "/usr/bin/node",
            "/usr/bin/nodejs",  // DEBIAN/UBUNTU PACKAGE NAME
        ];
        for p in &common_paths {
            let pb = PathBuf::from(p);
            if pb.exists() {
                return Ok(pb);
            }
        }
    }

    anyhow::bail!("Node runtime binary was not found. Please ensure node is installed or bundled in web/bin.");
}
