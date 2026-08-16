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
        cmd.arg("build/index.js")
            .current_dir(&clean_web_dir)
            .env("PORT", port.to_string())
            .env("HOST", "0.0.0.0")
            .env("ML_BASE_URL", format!("http://127.0.0.1:{}", ml_port))
            .env("DATABASE_PATH", "./data/manua.db")
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

    anyhow::bail!("Node runtime binary was not found. Please ensure node is installed or bundled in web/bin.");
}
