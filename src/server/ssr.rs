use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use tracing::info;

pub struct SsrServer {
    child: Option<Child>,
}

impl SsrServer {
    pub fn start(web_dir: &Path, port: u16, ml_port: u16) -> anyhow::Result<Self> {
        let node_bin = find_node_binary(web_dir)?;
        let clean_web_dir = normalize_windows_path(web_dir);
        let build_index = clean_web_dir.join("build").join("index.js");

        if !build_index.exists() {
            anyhow::bail!(
                "SSR build artifact not found at {:?}. Please run 'npm run build' inside web directory.",
                build_index
            );
        }

        let mut cmd = Command::new(&node_bin);

        // Resolve DATA_ROOT and DATABASE_PATH from our environment so we forward
        // the values that main.rs already computed (app-data dir on embed-web builds,
        // or ./data for on-disk dev builds).
        let data_root = std::env::var("DATA_ROOT").unwrap_or_else(|_| "./data".to_string());
        let db_path = std::env::var("DATABASE_PATH")
            .unwrap_or_else(|_| format!("{}/manua.db", data_root));

        // NODE_PATH lets Node resolve `require('better-sqlite3')` and
        // `require('@napi-rs/canvas')` from the extracted node_modules directory
        // that lives inside the app dir (next to build/).
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

        cmd.arg("build/index.js")
            .current_dir(&clean_web_dir)
            .env("PORT", port.to_string())
            .env("HOST", "0.0.0.0")
            .env("ML_BASE_URL", format!("http://127.0.0.1:{}", ml_port))
            .env("DATA_ROOT", &data_root)
            .env("DATABASE_PATH", &db_path)
            .env("NODE_PATH", &node_path)
            .env("BODY_SIZE_LIMIT", "64M")
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());


        info!("Starting SvelteKit SSR Engine on port {}...", port);
        let child = cmd.spawn()?;

        Ok(Self { child: Some(child) })
    }

    pub fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for SsrServer {
    fn drop(&mut self) {
        self.stop();
    }
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
    // 1. Check next to web_dir / portable binary directory
    let local_node = web_dir.join("bin").join(if cfg!(windows) { "node.exe" } else { "node" });
    if local_node.exists() {
        return Ok(local_node);
    }

    // 2. Check PATH environment variable
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
        // Homebrew (Apple Silicon primary, Intel fallback), nvm, volta, system Node.
        let home = std::env::var("HOME").unwrap_or_default();
        let common_paths = [
            "/opt/homebrew/bin/node",          // Homebrew on Apple Silicon (M1/M2/M3/M4)
            "/usr/local/bin/node",             // Homebrew on Intel Mac / system installs
            "/usr/bin/node",                   // System Node (rare on macOS)
        ];
        // nvm and volta use home-relative paths
        let nvm_path = format!("{}/.nvm/versions/node", home);
        let volta_path = format!("{}/.volta/bin/node", home);
        let home_relative = [volta_path.as_str()];
        for p in common_paths.iter().chain(home_relative.iter()) {
            let pb = PathBuf::from(p);
            if pb.exists() {
                return Ok(pb);
            }
        }
        // nvm: scan ~/.nvm/versions/node/ for the most recently installed version
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
        // Linux and other Unix systems.
        let common_paths = [
            "/usr/local/bin/node",
            "/usr/bin/node",
            "/usr/bin/nodejs",  // Debian/Ubuntu package name
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
