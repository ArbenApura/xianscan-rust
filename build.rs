// build.rs — runs at compile time to locate platform-specific native .node binaries
// and expose their paths to the Rust source via environment variables.
//
// This is only meaningful when the `embed-web` feature is enabled.
// When disabled the script exits immediately so it doesn't slow down dev builds.

use std::path::PathBuf;

fn main() {
    // 1. Embed Windows executable icon (.ico) into .exe binary header
    #[cfg(target_os = "windows")]
    {
        let mut res = winres::WindowsResource::new();
        res.set_icon("assets/icon.ico");
        res.set("ProductName", "XianScan");
        res.set("FileDescription", "XianScan Native Comic Translation Server");
        res.set("LegalCopyright", "Copyright (c) 2026 XianScan");
        if let Err(e) = res.compile() {
            println!("cargo:warning=Failed to compile Windows resource icon: {}", e);
        }
    }

    println!("cargo:rerun-if-changed=assets/icon.ico");

    // Only do discovery work when embed-web is requested.
    if std::env::var("CARGO_FEATURE_EMBED_WEB").is_err() {
        return;
    }

    // Emit a unique build timestamp so the VERSION stamp changes every compile.
    // Without this, every build writes "0.1.0" and stale extractions are never refreshed.
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    println!("cargo:rustc-env=BUILD_TIMESTAMP={}", ts);
    // Always rerun — we want a fresh stamp on every cargo build.
    println!("cargo:rerun-if-changed=build.rs");

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let node_modules = manifest_dir.join("web").join("node_modules");

    // -----------------------------------------------------------------------
    // 1. better-sqlite3
    // -----------------------------------------------------------------------
    let bs3_node = node_modules
        .join("better-sqlite3")
        .join("build")
        .join("Release")
        .join("better_sqlite3.node");

    if bs3_node.exists() {
        // Canonicalize to an absolute path so include_bytes! is unambiguous.
        // On Windows, canonicalize() returns \\?\C:\... UNC extended paths which
        // include_bytes! rejects — strip the prefix to get a plain C:\... path.
        let abs = bs3_node.canonicalize().unwrap_or(bs3_node.clone());
        let abs_str = strip_unc_prefix(abs.display().to_string());
        println!("cargo:rustc-env=BETTER_SQLITE3_NODE_PATH={}", abs_str);
        println!("cargo:rerun-if-changed={}", abs_str);
    } else {
        // Emit a non-fatal warning; the compile will still fail at include_bytes!
        // which gives a clear error message.
        println!(
            "cargo:warning=better-sqlite3 .node not found at {}. Run `yarn install` in web/.",
            bs3_node.display()
        );
        // Emit a dummy value so the env! macro in web_assets.rs doesn't cause a
        // "env var not set" panic during the macro expansion phase — the
        // missing file error from include_bytes! is clearer.
        println!("cargo:rustc-env=BETTER_SQLITE3_NODE_PATH=MISSING_BETTER_SQLITE3");
    }

    // -----------------------------------------------------------------------
    // 2. @napi-rs/canvas  (Skia)
    // -----------------------------------------------------------------------
    // package manager installs exactly one platform-specific subpackage, e.g.:
    //   @napi-rs/canvas-win32-x64-msvc/   (Windows x64)
    //   @napi-rs/canvas-linux-x64-gnu/    (Linux x64 glibc)
    //   @napi-rs/canvas-darwin-universal/ (macOS universal)
    //   @napi-rs/canvas-darwin-arm64/     (macOS ARM64)
    //
    // We scan for any `canvas-*` directory containing a `skia.*.node` file.
    // The filename tells js-binding.js which require() call will succeed.
    let napi_dir = node_modules.join("@napi-rs");
    let mut skia_path: Option<PathBuf> = None;
    let mut skia_filename: Option<String> = None;
    let mut icu_path: Option<PathBuf> = None;

    if let Ok(entries) = std::fs::read_dir(&napi_dir) {
        for entry in entries.flatten() {
            let dir_name = entry.file_name();
            if !dir_name.to_string_lossy().starts_with("canvas-") {
                continue;
            }
            if let Ok(files) = std::fs::read_dir(entry.path()) {
                for file in files.flatten() {
                    let fname = file.file_name();
                    let fname_str = fname.to_string_lossy();
                    if fname_str.starts_with("skia.") && fname_str.ends_with(".node") {
                        skia_path = Some(file.path());
                        skia_filename = Some(fname_str.to_string());
                    } else if fname_str == "icudtl.dat" {
                        icu_path = Some(file.path());
                    }
                }
            }
            if skia_path.is_some() {
                break;
            }
        }
    }

    if let (Some(path), Some(filename)) = (skia_path, skia_filename) {
        let abs = path.canonicalize().unwrap_or(path.clone());
        let abs_str = strip_unc_prefix(abs.display().to_string());
        println!("cargo:rustc-env=SKIA_NODE_PATH={}", abs_str);
        println!("cargo:rustc-env=SKIA_NODE_FILENAME={}", filename);
        println!("cargo:rerun-if-changed={}", abs_str);
    } else {
        println!(
            "cargo:warning=@napi-rs/canvas skia .node not found under {}. Run `yarn install` in web/.",
            napi_dir.display()
        );
        println!("cargo:rustc-env=SKIA_NODE_PATH=MISSING_SKIA_NODE");
        println!("cargo:rustc-env=SKIA_NODE_FILENAME=skia.missing.node");
    }

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap_or_else(|_| ".".to_string()));
    let empty_icu_path = out_dir.join("empty_icudtl.dat");
    if !empty_icu_path.exists() {
        let _ = std::fs::write(&empty_icu_path, b"");
    }

    if let Some(path) = icu_path {
        let abs = path.canonicalize().unwrap_or(path.clone());
        let abs_str = strip_unc_prefix(abs.display().to_string());
        println!("cargo:rustc-env=SKIA_ICU_PATH={}", abs_str);
        println!("cargo:rerun-if-changed={}", abs_str);
    } else {
        let abs = empty_icu_path.canonicalize().unwrap_or(empty_icu_path);
        let abs_str = strip_unc_prefix(abs.display().to_string());
        println!("cargo:rustc-env=SKIA_ICU_PATH={}", abs_str);
    }

    // -----------------------------------------------------------------------
    // 3. Standalone Node.js Runtime Binary (Optional Bundling)
    // -----------------------------------------------------------------------
    let web_bin_dir = manifest_dir.join("web").join("bin");
    let node_bin_candidates = [
        web_bin_dir.join("node.exe"),
        web_bin_dir.join("node"),
    ];

    let mut node_bin_path: Option<PathBuf> = None;
    for candidate in &node_bin_candidates {
        if candidate.exists() {
            node_bin_path = Some(candidate.clone());
            break;
        }
    }

    let empty_node_path = out_dir.join("empty_node_bin");
    if !empty_node_path.exists() {
        let _ = std::fs::write(&empty_node_path, b"");
    }

    if let Some(path) = node_bin_path {
        let abs = path.canonicalize().unwrap_or(path.clone());
        let abs_str = strip_unc_prefix(abs.display().to_string());
        println!("cargo:rustc-env=NODE_BIN_PATH={}", abs_str);
        println!("cargo:rerun-if-changed={}", abs_str);
    } else {
        let abs = empty_node_path.canonicalize().unwrap_or(empty_node_path);
        let abs_str = strip_unc_prefix(abs.display().to_string());
        println!("cargo:rustc-env=NODE_BIN_PATH={}", abs_str);
    }

    // -----------------------------------------------------------------------
    // 4. Compute Web Build Fingerprint & Versioning
    // -----------------------------------------------------------------------
    let web_dir = manifest_dir.join("web");
    let web_build_dir = web_dir.join("build");

    let (web_build_hash, web_build_time) = if web_build_dir.exists() {
        let fingerprint = compute_dir_fingerprint(&web_build_dir);
        let hash_str = format!("{:012x}", fingerprint);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        (hash_str, now.to_string())
    } else {
        ("unbuilt".to_string(), "0".to_string())
    };

    println!("cargo:rustc-env=WEB_BUILD_HASH={}", web_build_hash);
    println!("cargo:rustc-env=WEB_BUILD_TIME={}", web_build_time);

    // -----------------------------------------------------------------------
    // 5. RERUN TRIGGERS (FRONTEND SOURCE, CONFIGS, ASSETS, AND OUTPUTS)
    // -----------------------------------------------------------------------
    rerun_if_dir_changed(&node_modules.join("better-sqlite3"));
    rerun_if_dir_changed(&node_modules.join("@napi-rs"));
    rerun_if_dir_changed(&web_bin_dir);
    rerun_if_dir_changed(&web_dir.join("src"));
    rerun_if_dir_changed(&web_dir.join("static"));
    rerun_if_dir_changed(&web_dir.join("drizzle"));
    rerun_if_dir_changed(&web_build_dir);
    println!("cargo:rerun-if-changed={}", web_dir.join("package.json").display());
    println!("cargo:rerun-if-changed={}", web_dir.join("yarn.lock").display());
    println!("cargo:rerun-if-changed={}", web_dir.join("vite.config.ts").display());
    println!("cargo:rerun-if-changed={}", web_dir.join("svelte.config.js").display());
}

/// COMPUTES FAST 64-BIT FNV-1A FINGERPRINT OF A DIRECTORY'S FILES (NAMES, SIZES, AND BYTES)
fn compute_dir_fingerprint(dir: &std::path::Path) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    let prime = 0x100000001b3u64;

    let mut files = Vec::new();
    collect_files(dir, dir, &mut files);
    files.sort_by(|a, b| a.cmp(b));

    for (rel_path, full_path) in files {
        for b in rel_path.as_bytes() {
            hash ^= *b as u64;
            hash = hash.wrapping_mul(prime);
        }
        if let Ok(metadata) = std::fs::metadata(&full_path) {
            for b in metadata.len().to_le_bytes() {
                hash ^= b as u64;
                hash = hash.wrapping_mul(prime);
            }
        }
        if let Ok(bytes) = std::fs::read(&full_path) {
            // SAMPLE FIRST AND LAST 256 BYTES FOR SPEED & COMPACTNESS
            let sample_len = bytes.len().min(256);
            for b in &bytes[..sample_len] {
                hash ^= *b as u64;
                hash = hash.wrapping_mul(prime);
            }
            if bytes.len() > 256 {
                let tail = &bytes[bytes.len() - 256..];
                for b in tail {
                    hash ^= *b as u64;
                    hash = hash.wrapping_mul(prime);
                }
            }
        }
    }
    hash
}

/// RECURSIVELY COLLECTS ALL RELATIVE AND ABSOLUTE PATHS OF FILES IN A DIRECTORY
fn collect_files(root: &std::path::Path, current: &std::path::Path, out: &mut Vec<(String, PathBuf)>) {
    if let Ok(entries) = std::fs::read_dir(current) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_files(root, &path, out);
            } else if let Ok(rel) = path.strip_prefix(root) {
                out.push((rel.to_string_lossy().replace('\\', "/"), path));
            }
        }
    }
}

/// Recursively emit `cargo:rerun-if-changed` for all files in a directory so
/// cargo rebuilds whenever frontend assets or compiled bundles change.
fn rerun_if_dir_changed(dir: &std::path::Path) {
    if !dir.exists() {
        return;
    }
    println!("cargo:rerun-if-changed={}", dir.display());
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                rerun_if_dir_changed(&path);
            } else {
                println!("cargo:rerun-if-changed={}", path.display());
            }
        }
    }
}

/// Strip the Windows extended-length path prefix (`\\?\`) that
/// `std::fs::canonicalize` emits on Windows. `include_bytes!` and
/// `include_str!` do not accept UNC extended paths.
fn strip_unc_prefix(s: String) -> String {
    s.strip_prefix(r"\\?\")
        .map(|stripped| stripped.to_string())
        .unwrap_or(s)
}
