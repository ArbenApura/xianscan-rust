// -- CRATE / EXTERNAL IMPORTS -- //
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use colored::Colorize;

use super::child_guard;
use tracing::debug;

// -- TYPES & STRUCTS -- //

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ServerKind {
    Ssr,
    ViteDev,
}

fn lock_or_recover<T>(m: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub struct SsrServer {
    child: Arc<std::sync::Mutex<Option<Child>>>,
    shutdown_signal: Arc<AtomicBool>,
    supervisor_handle: Option<tokio::task::JoinHandle<()>>,
}

/// EVERYTHING THE NODE CHILD NEEDS TO KNOW ABOUT PORTS AND ACCESS. THE SUPERVISOR KEEPS THE CONFIG
/// IT STARTED WITH, SO A LAN TOGGLE APPLIES ON THE NEXT FULL RESTART OF XIANSCAN.
#[derive(Debug, Clone)]
pub struct SpawnConfig {
    pub port: u16,
    pub ml_port: u16,
    pub bind_host: &'static str,
    pub bind_source: &'static str,
    pub token_path: PathBuf,
    pub ml_secret: Option<String>,
    pub env: SsrEnv,
}

/// DATA PATHS FORWARDED TO THE NODE CHILD. RESOLVED ONCE IN main (NOT RE-READ FROM THE ENVIRONMENT).
#[derive(Debug, Clone)]
pub struct SsrEnv {
    pub data_root: PathBuf,
    pub database_path: PathBuf,
}

// -- TRAITS & IMPLEMENTATIONS -- //

impl SsrServer {
    pub fn start(web_dir: &Path, cfg: SpawnConfig) -> anyhow::Result<Self> {
        Self::start_internal(ServerKind::Ssr, web_dir, cfg)
    }

    pub fn start_vite_dev(web_dir: &Path, cfg: SpawnConfig) -> anyhow::Result<Self> {
        Self::start_internal(ServerKind::ViteDev, web_dir, cfg)
    }

    fn start_internal(
        kind: ServerKind,
        web_dir: &Path,
        cfg: SpawnConfig,
    ) -> anyhow::Result<Self> {
        let port = cfg.port;
        warn_if_port_taken(cfg.bind_host, port);

        // SPAWNED ON THE CALLING (MAIN) THREAD; RESTARTS HAPPEN ON TOKIO WORKER THREADS, WHICH LIVE AS
        // LONG AS THE RUNTIME. NEVER SPAWN FROM `spawn_blocking`: ON LINUX, PDEATHSIG FIRES WHEN THE
        // SPAWNING THREAD EXITS, AND BLOCKING-POOL THREADS EXIT AFTER 10 S IDLE (IT WOULD KILL NODE).
        let initial_child = spawn_process(kind, web_dir, &cfg, 0)?;
        let child = Arc::new(std::sync::Mutex::new(Some(initial_child)));
        let shutdown_signal = Arc::new(AtomicBool::new(false));

        let child_clone = Arc::clone(&child);
        let shutdown_clone = Arc::clone(&shutdown_signal);
        let web_dir_buf = web_dir.to_path_buf();

        let supervisor_handle = tokio::spawn(async move {
            let mut exit_times: Vec<Instant> = Vec::new();
            let mut last_spawn_time = Instant::now();
            let mut restart_count: u32 = 0;
            // SET WHEN THE CHILD EXITED (OR A RESPAWN FAILED) AND A RESTART IS DUE AFTER THE DELAY
            let mut pending_restart: Option<Duration> = None;

            loop {
                tokio::time::sleep(Duration::from_millis(1000)).await;
                if shutdown_clone.load(Ordering::SeqCst) {
                    break;
                }

                if pending_restart.is_none() {
                pending_restart = {
                    // A POISONED LOCK MUST NOT END SUPERVISION; THE CHILD HANDLE INSIDE IS STILL VALID
                    let mut guard = lock_or_recover(&child_clone);
                    let mut exited = None;
                    if let Some(ref mut c) = *guard {
                        match c.try_wait() {
                            Ok(Some(status)) => {
                                // REAP TERMINATED PROCESS TO PREVENT ZOMBIE PROCESSES
                                let _ = c.wait();
                                exited = Some(status);
                            }
                            Ok(None) => {}
                            Err(e) => tracing::warn!("Failed to poll web child process: {}", e),
                        }
                    }
                    match exited {
                        Some(status) if !shutdown_clone.load(Ordering::SeqCst) => {
                            // REMOVE TERMINATED PROCESS FROM MUTEX TO PREVENT RE-POLLING STALE HANDLE
                            let _ = guard.take();
                            let now = Instant::now();
                            let uptime = now.duration_since(last_spawn_time);
                            if uptime >= HEALTHY_UPTIME {
                                exit_times.clear();
                            }
                            exit_times.retain(|t| now.duration_since(*t) < BACKOFF_WINDOW);
                            exit_times.push(now);
                            let ages: Vec<Duration> = exit_times.iter().map(|t| now.duration_since(*t)).collect();
                            let delay = restart_delay(&ages, uptime);

                            eprintln!(
                                "\n  {} Web Studio (port {}) exited unexpectedly (status {}).",
                                "[!]".bright_yellow().bold(),
                                port,
                                status
                            );
                            if status.code() == Some(NODE_CRASH_EXIT_CODE) {
                                eprintln!(
                                    "  {} Web Studio crashed on an uncaught exception, see the log above.",
                                    "[!]".bright_red().bold()
                                );
                            }
                            eprintln!(
                                "  {} Restarting Web Studio in {} s ({} exit(s) in the last minute)...",
                                "↻".bright_cyan().bold(),
                                delay.as_secs(),
                                exit_times.len()
                            );
                            Some(delay)
                        }
                        Some(_) => {
                            let _ = guard.take();
                            None
                        }
                        None => None,
                    }
                };
                }

                let Some(delay) = pending_restart.take() else { continue };
                tokio::time::sleep(delay).await;
                if shutdown_clone.load(Ordering::SeqCst) {
                    break;
                }

                restart_count += 1;
                match spawn_process(kind, &web_dir_buf, &cfg, restart_count) {
                    Ok(mut new_child) => {
                        last_spawn_time = Instant::now();
                        {
                            let mut guard = lock_or_recover(&child_clone);
                            if shutdown_clone.load(Ordering::SeqCst) {
                                // TERMINATE CHILD IMMEDIATELY IF SHUTDOWN OCCURRED IN-FLIGHT OR UNDER LOCK
                                kill_tree(&mut new_child);
                                break;
                            }
                            *guard = Some(new_child);
                        }
                        eprintln!(
                            "  {} Web Studio restarted and listening on port {}.\n",
                            "✓".bright_green().bold(),
                            port
                        );
                    }
                    Err(e) => {
                        // COUNTS AS A QUICK EXIT SO REPEATED SPAWN FAILURES BACK OFF TOO
                        exit_times.push(Instant::now());
                        let ages: Vec<Duration> = exit_times.iter().map(|t| t.elapsed()).collect();
                        let delay = restart_delay(&ages, Duration::ZERO);
                        eprintln!(
                            "  {} Failed to restart Web Studio: {} (retrying in {} s)",
                            "[✗]".bright_red().bold(),
                            e,
                            delay.as_secs()
                        );
                        pending_restart = Some(delay);
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
        {
            let mut guard = lock_or_recover(&self.child);
            if let Some(mut child) = guard.take() {
                kill_tree(&mut child);
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

/// EXIT CODE THE NODE SERVER USES AFTER AN UNCAUGHT EXCEPTION (FEAT-002 ADR-005).
const NODE_CRASH_EXIT_CODE: i32 = 70;
/// EXITS OLDER THAN THIS NO LONGER COUNT TOWARD THE BACKOFF.
const BACKOFF_WINDOW: Duration = Duration::from_secs(60);
/// A RUN THAT STAYED UP THIS LONG WAS HEALTHY; THE NEXT RESTART STARTS FROM THE SHORTEST DELAY.
const HEALTHY_UPTIME: Duration = Duration::from_secs(120);
const MAX_RESTART_DELAY: Duration = Duration::from_secs(60);

/// DELAY BEFORE RESTARTING THE WEB SERVER. `recent_exits` ARE THE AGES OF PAST EXITS (THE ONE THAT
/// JUST HAPPENED IS 0 S OLD); ONLY THOSE IN THE LAST 60 S COUNT. 1 S, 2 S, 4 S ... CAPPED AT 60 S,
/// AND BACK TO 1 S WHEN THE LAST RUN STAYED UP FOR 2 MINUTES.
pub fn restart_delay(recent_exits: &[Duration], uptime_of_last_run: Duration) -> Duration {
    if uptime_of_last_run >= HEALTHY_UPTIME {
        return Duration::from_secs(1);
    }
    let exits = recent_exits.iter().filter(|age| **age < BACKOFF_WINDOW).count().max(1) as u32;
    let factor = 1_u64.checked_shl(exits - 1).unwrap_or(u64::MAX);
    Duration::from_secs(factor).min(MAX_RESTART_DELAY)
}

/// ADR-007: REPORT (NEVER KILL) WHATEVER ALREADY HOLDS THE WEB PORT, USUALLY AN ORPHANED NODE
/// SERVER FROM AN EARLIER CRASH. CHECKS THE SAME ADDRESS THE CHILD WILL BIND.
fn warn_if_port_taken(host: &str, port: u16) {
    if std::net::TcpListener::bind((host, port)).is_ok() {
        return;
    }
    let find = if cfg!(windows) {
        format!("netstat -ano | findstr :{port}   (then: tasklist /FI \"PID eq <pid>\")")
    } else {
        format!("lsof -nP -iTCP:{port} -sTCP:LISTEN")
    };
    eprintln!(
        "\n  {} Port {} is already in use, probably by an orphaned Web Studio (node) from an earlier crash.\n      Find it with: {}\n      Stop that process or set PORT to another value, then restart XianScan.",
        "[!]".bright_yellow().bold(),
        port,
        find
    );
}

/// KILLS THE CHILD AND (ON WINDOWS) EVERYTHING IT STARTED, THEN REAPS IT.
fn kill_tree(child: &mut Child) {
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

fn spawn_process(kind: ServerKind, web_dir: &Path, cfg: &SpawnConfig, restart_count: u32) -> anyhow::Result<Child> {
    let mut cmd = match kind {
        ServerKind::Ssr => ssr_command(web_dir, cfg)?,
        ServerKind::ViteDev => vite_dev_command(web_dir, cfg),
    };
    cmd.env("XIANSCAN_RESTART_COUNT", restart_count.to_string());
    // THE STDIN WATCHDOG ONLY FOR THE BUILT SERVER; `yarn dev` HAS ITS OWN STDIN HANDLING
    child_guard::configure_command(&mut cmd, kind == ServerKind::Ssr);
    debug!("Starting web server ({:?}) on port {}...", kind, cfg.port);
    let child = cmd.spawn()?;
    if let Err(e) = child_guard::bind_child(&child) {
        tracing::warn!("Web Studio will not be stopped automatically if XianScan crashes: {}", e);
    }
    Ok(child)
}

/// ACCESS-RELATED ENVIRONMENT SHARED BY BOTH SPAWN PATHS.
fn apply_access_env(cmd: &mut Command, cfg: &SpawnConfig) {
    cmd.env("HOST", cfg.bind_host)
        .env("XIANSCAN_BIND_SOURCE", cfg.bind_source)
        .env("ACCESS_TOKEN_PATH", &cfg.token_path);
    if let Some(secret) = &cfg.ml_secret {
        cmd.env("ML_SHARED_SECRET", secret);
    }
}

fn ssr_command(web_dir: &Path, cfg: &SpawnConfig) -> anyhow::Result<Command> {
    let (port, ml_port) = (cfg.port, cfg.ml_port);
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

    // FORWARD THE DATA PATHS MAIN.RS ALREADY COMPUTED
    let (data_root, db_path) = (&cfg.env.data_root, &cfg.env.database_path);

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

    // CONFIGURE 4GB HEAP CEILING TO PREVENT V8 OOM ON LONG RUNS,
    // DISABLE PROBLEM-PRONE MAGLEV JIT ON WINDOWS TO PREVENT STACK BUFFER OVERRUNS (0xc0000409),
    // EXPOSE GC FOR EXPLICIT FINALIZATION OF UNMANAGED NATIVE SKIA MEMORY BUFFERS,
    // AND SUPPRESS NODE ENGINE DEPRECATION WARNINGS (E.G. PUNYCODE DEP0040)
    cmd.arg("--max-old-space-size=4096")
        .arg("--max-semi-space-size=64")
        .arg("--no-maglev")
        .arg("--expose-gc")
        .arg("--no-deprecation")
        .arg("build/index.js")
        .current_dir(&clean_web_dir)
        .env("PORT", port.to_string())
        .env("ML_BASE_URL", format!("http://127.0.0.1:{}", ml_port))
        .env("DATA_ROOT", data_root)
        .env("DATABASE_PATH", db_path)
        .env("NODE_PATH", &node_path)
        .env("BODY_SIZE_LIMIT", "64M")
        .stdout(if verbose_logging() {
            Stdio::inherit()
        } else {
            Stdio::null()
        })
        .stderr(Stdio::inherit());

    apply_access_env(&mut cmd, cfg);
    Ok(cmd)
}

fn vite_dev_command(web_dir: &Path, cfg: &SpawnConfig) -> Command {
    let (port, ml_port) = (cfg.port, cfg.ml_port);
    let clean_web_dir = normalize_windows_path(web_dir);
    let (data_root, db_path) = (&cfg.env.data_root, &cfg.env.database_path);

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
        .env("ML_BASE_URL", format!("http://127.0.0.1:{}", ml_port))
        .env("DATA_ROOT", data_root)
        .env("DATABASE_PATH", db_path)
        // STREAM VITE STDOUT ONLY WHEN LOG_REQUESTS=1 QUIET BY DEFAULT SO BENIGN
        // BROWSER PROBES (E.G. /.well-known/appspecific/* CHROME DEVTOOLS) DON'T
        // CLUTTER THE CLI WITH 404 NOISE. STDERR (REAL ERRORS) IS ALWAYS SHOWN.
        .stdout(if verbose_logging() {
            Stdio::inherit()
        } else {
            Stdio::null()
        })
        .stderr(Stdio::inherit());

    apply_access_env(&mut cmd, cfg);
    cmd
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
