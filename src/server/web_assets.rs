//! Web asset embedding and self-extraction.
//!
//! When built with `--features embed-web` the SvelteKit build output (`web/build/`),
//! the Drizzle migration files (`web/drizzle/`), and the native `.node` addon binaries
//! (better-sqlite3, @napi-rs/canvas Skia) are compiled directly into the Rust binary.
//!
//! At startup, `extract_if_needed()` writes those assets to a versioned app-data
//! directory and returns its path for use as `web_dir` by `SsrServer`.
//! If the directory already contains a matching `VERSION` stamp the extraction is
//! skipped entirely (fast path, ~0 ms).
//!
//! User data (uploads, images, the SQLite database) lives in a *separate* data
//! directory (`get_data_dir()`) that is never touched by the extraction logic.
//!
//! The exact paths of the native `.node` binaries are discovered at compile time by
//! `build.rs`, which scans the platform's `web/node_modules/` tree after `npm install`
//! and emits `BETTER_SQLITE3_NODE_PATH`, `SKIA_NODE_PATH`, and `SKIA_NODE_FILENAME`
//! as `cargo:rustc-env` variables. This makes the embedding fully platform-agnostic —
//! the same source works on Windows x64, Linux x64 (glibc/musl), macOS x64, and
//! macOS ARM64 without any per-platform `#[cfg]` blocks.

use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Compile-time asset embedding (embed-web feature only)
// ---------------------------------------------------------------------------

#[cfg(feature = "embed-web")]
use include_dir::{include_dir, Dir};

/// Compiled-in copy of `web/build/` — the SvelteKit adapter-node output.
#[cfg(feature = "embed-web")]
static WEB_BUILD: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/web/build");

/// Compiled-in copy of `web/drizzle/` — SQL migration files used by drizzle-orm.
#[cfg(feature = "embed-web")]
static WEB_DRIZZLE: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/web/drizzle");

/// Compiled-in copy of `web/static/` — static assets served by the app.
/// Includes fonts referenced by typeset.ts via `../../../static/fonts` relative
/// to its production chunk location (`build/server/chunks/`) which resolves to
/// `{app_dir}/static/`. Must be extracted to `{app_dir}/static/`.
#[cfg(feature = "embed-web")]
static WEB_STATIC: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/web/static");

/// Compiled-in copy of the `@napi-rs/canvas` pure-JS wrapper package.
/// The JS files (js-binding.js, index.js, load-image.js …) need to live alongside
/// the platform `.node` binary so that `require('./skia.<platform>.node')` resolves.
#[cfg(feature = "embed-web")]
static NAPI_CANVAS_JS: Dir<'static> =
    include_dir!("$CARGO_MANIFEST_DIR/web/node_modules/@napi-rs/canvas");

/// better-sqlite3 JS runtime files (`lib/` directory).
/// `database.js` calls `require('bindings')('better_sqlite3.node')` to load the native addon.
#[cfg(feature = "embed-web")]
static BETTER_SQLITE3_LIB: Dir<'static> =
    include_dir!("$CARGO_MANIFEST_DIR/web/node_modules/better-sqlite3/lib");

/// better-sqlite3 package.json — Node needs this to resolve the package root and find `main`.
#[cfg(feature = "embed-web")]
const BETTER_SQLITE3_PKG_JSON: &str =
    include_str!("../../web/node_modules/better-sqlite3/package.json");

/// `bindings` npm package — used by better-sqlite3 to locate the `.node` addon file.
/// It searches `build/Release/` relative to the package root, which is exactly where we extract it.
#[cfg(feature = "embed-web")]
static BINDINGS_PKG: Dir<'static> =
    include_dir!("$CARGO_MANIFEST_DIR/web/node_modules/bindings");

/// `file-uri-to-path` npm package — a dependency of `bindings`.
#[cfg(feature = "embed-web")]
static FILE_URI_TO_PATH_PKG: Dir<'static> =
    include_dir!("$CARGO_MANIFEST_DIR/web/node_modules/file-uri-to-path");


// ---------------------------------------------------------------------------
// Native .node addon binaries
//
// Paths are resolved by build.rs at compile time by scanning the npm-installed
// node_modules tree, then emitted as cargo:rustc-env variables.  This works on
// every platform without explicit #[cfg(target_os = ...)] blocks.
// ---------------------------------------------------------------------------

/// better-sqlite3 native addon for the current platform.
/// Path discovered by build.rs → BETTER_SQLITE3_NODE_PATH.
#[cfg(feature = "embed-web")]
static BETTER_SQLITE3_NODE: &[u8] = include_bytes!(env!("BETTER_SQLITE3_NODE_PATH"));

/// Skia canvas native addon for the current platform.
/// Path discovered by build.rs → SKIA_NODE_PATH.
#[cfg(feature = "embed-web")]
static SKIA_NODE: &[u8] = include_bytes!(env!("SKIA_NODE_PATH"));

/// Filename of the Skia .node binary (e.g. `skia.win32-x64-msvc.node`).
/// js-binding.js uses `require('./<SKIA_NODE_FILENAME>')` to load it, so the
/// extracted file must use exactly this name.
/// Value set by build.rs → SKIA_NODE_FILENAME.
#[cfg(feature = "embed-web")]
const SKIA_NODE_FILENAME: &str = env!("SKIA_NODE_FILENAME");

/// Skia ICU data file for Unicode / SkParagraph text rendering.
/// Path discovered by build.rs → SKIA_ICU_PATH.
#[cfg(feature = "embed-web")]
static SKIA_ICU_BYTES: &[u8] = include_bytes!(env!("SKIA_ICU_PATH"));

/// Optional bundled standalone Node.js binary for the current platform.
/// Path discovered by build.rs → NODE_BIN_PATH.
#[cfg(feature = "embed-web")]
static NODE_BINARY: &[u8] = include_bytes!(env!("NODE_BIN_PATH"));



// ---------------------------------------------------------------------------
// App-data directory resolution
// ---------------------------------------------------------------------------

/// Returns the per-user application data root: `{data_dir}/XianScan/`.
///
/// | Platform | Base                                               |
/// |----------|----------------------------------------------------|
/// | Windows  | `%APPDATA%\XianScan`                               |
/// | macOS    | `~/Library/Application Support/XianScan`           |
/// | Linux    | `$XDG_DATA_HOME/xianscan` or `~/.local/share/xianscan` |
fn app_data_root() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home_dir().join("AppData").join("Roaming"));
        return base.join("XianScan");
    }

    #[cfg(target_os = "macos")]
    {
        return home_dir()
            .join("Library")
            .join("Application Support")
            .join("XianScan");
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        return std::env::var("XDG_DATA_HOME")
            .map(|v| PathBuf::from(v).join("xianscan"))
            .unwrap_or_else(|_| home_dir().join(".local").join("share").join("xianscan"));
    }
}

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// Directory where the extracted web app lives: `{appdata}/XianScan/app/`.
/// Populated (or refreshed) by `extract_if_needed()` on startup.
pub fn get_app_dir() -> PathBuf {
    app_data_root().join("app")
}

/// Directory where user data lives: `{appdata}/XianScan/data/`.
/// Contains the SQLite database, uploaded images, processed pages, and thumbnail cache.
/// **Never cleared by app updates.**
pub fn get_data_dir() -> PathBuf {
    app_data_root().join("data")
}

// ---------------------------------------------------------------------------
// Extraction logic
// ---------------------------------------------------------------------------

/// Build version stamp — bumped whenever the crate version changes or the binary
/// is recompiled with different embedded assets.
/// Includes a build timestamp (seconds since epoch) so that every `cargo build`
/// produces a unique stamp, ensuring stale extractions are always refreshed.
#[cfg(feature = "embed-web")]
const APP_VERSION: &str = concat!(env!("CARGO_PKG_VERSION"), "+", env!("BUILD_TIMESTAMP"));

/// Extract embedded web assets to [`get_app_dir()`] if needed, then return
/// the app directory path (used as `web_dir` by `SsrServer`).
///
/// When the `embed-web` feature is **disabled** this is a no-op that returns
/// `None`; `main.rs` falls back to looking for an on-disk `web/` folder.
pub fn extract_if_needed() -> anyhow::Result<Option<PathBuf>> {
    #[cfg(feature = "embed-web")]
    {
        let app_dir = get_app_dir();
        let version_stamp = app_dir.join("VERSION");

        // Fast path: already extracted at the current version and critical assets exist.
        let fonts_exist = app_dir
            .join("static")
            .join("fonts")
            .join("CCWildWords-Roman.ttf")
            .exists();

        let icu_exist = if !SKIA_ICU_BYTES.is_empty() {
            app_dir
                .join("node_modules")
                .join("@napi-rs")
                .join("canvas")
                .join("icudtl.dat")
                .exists()
        } else {
            true
        };

        let node_exist = if !NODE_BINARY.is_empty() {
            let node_exe_name = if cfg!(windows) { "node.exe" } else { "node" };
            app_dir.join("bin").join(node_exe_name).exists()
        } else {
            true
        };

        let pkg_exist = app_dir.join("package.json").exists();

        let already_current = version_stamp
            .exists()
            .then(|| std::fs::read_to_string(&version_stamp).ok())
            .flatten()
            .map(|v| v.trim() == APP_VERSION)
            .unwrap_or(false)
            && fonts_exist
            && icu_exist
            && node_exist
            && pkg_exist;

        if !already_current {
            tracing::info!("Extracting embedded web assets to {:?} …", app_dir);
            extract_all(&app_dir)?;
            std::fs::create_dir_all(&app_dir)?;
            std::fs::write(&version_stamp, APP_VERSION)?;
            tracing::info!("Web assets extracted successfully.");
        }

        return Ok(Some(app_dir));
    }

    // embed-web disabled — caller uses on-disk web/ folder.
    #[cfg(not(feature = "embed-web"))]
    Ok(None)
}

/// Write every embedded file to `app_dir`, creating directories as needed.
#[cfg(feature = "embed-web")]
fn extract_all(app_dir: &std::path::Path) -> anyhow::Result<()> {
    use std::fs;

    // 0. App package.json — declares ES module type so Node loads build/index.js as ESM
    fs::write(app_dir.join("package.json"), r#"{"type":"module"}"#)?;

    // 1. SvelteKit build output → app_dir/build/
    extract_dir(&WEB_BUILD, &app_dir.join("build"))?;

    // 2. Drizzle migration SQL files → app_dir/drizzle/
    //    drizzle-orm reads these at first boot to bring the DB schema up to date.
    extract_dir(&WEB_DRIZZLE, &app_dir.join("drizzle"))?;

    // 3. Static assets → app_dir/static/
    //    typeset.ts resolves fonts via `../../../static/fonts` relative to its
    //    production chunk at `build/server/chunks/` — that resolves to
    //    `{app_dir}/static/fonts`. Extracting web/static/ here satisfies that path.
    extract_dir(&WEB_STATIC, &app_dir.join("static"))?;

    // 3. better-sqlite3 package
    //    Loading chain:
    //      chunk imports 'better-sqlite3'
    //      → lib/index.js  (exports lib/database.js)
    //      → lib/database.js  calls require('bindings')('better_sqlite3.node')
    //      → bindings package resolves build/Release/better_sqlite3.node
    //      → native addon loaded ✓
    let bs3_root = app_dir.join("node_modules").join("better-sqlite3");
    fs::create_dir_all(&bs3_root)?;
    // package.json — tells Node the package name and main entry point
    fs::write(bs3_root.join("package.json"), BETTER_SQLITE3_PKG_JSON)?;
    // lib/ — all JavaScript wrapper files
    extract_dir(&BETTER_SQLITE3_LIB, &bs3_root.join("lib"))?;
    // build/Release/ — the platform-specific native binary
    let bs3_release = bs3_root.join("build").join("Release");
    fs::create_dir_all(&bs3_release)?;
    fs::write(bs3_release.join("better_sqlite3.node"), BETTER_SQLITE3_NODE)?;

    // 4. bindings package — better-sqlite3's native addon locator
    extract_dir(&BINDINGS_PKG, &app_dir.join("node_modules").join("bindings"))?;

    // 5. file-uri-to-path package — dependency of bindings
    extract_dir(
        &FILE_URI_TO_PATH_PKG,
        &app_dir.join("node_modules").join("file-uri-to-path"),
    )?;

    // 6. @napi-rs/canvas JS wrapper + platform Skia .node binary
    //    js-binding.js first tries `require('./skia.<platform>.node')` —
    //    the .node file must therefore live *in the same directory* as js-binding.js.
    //    We extract the full @napi-rs/canvas package, then place the .node binary
    //    alongside it using the exact filename build.rs discovered.
    let canvas_pkg_dir = app_dir
        .join("node_modules")
        .join("@napi-rs")
        .join("canvas");
    extract_dir(&NAPI_CANVAS_JS, &canvas_pkg_dir)?;
    fs::write(canvas_pkg_dir.join(SKIA_NODE_FILENAME), SKIA_NODE)?;
    if !SKIA_ICU_BYTES.is_empty() {
        fs::write(canvas_pkg_dir.join("icudtl.dat"), SKIA_ICU_BYTES)?;
    }

    // 7. Standalone Node.js Runtime (if bundled)
    if !NODE_BINARY.is_empty() {
        let bin_dir = app_dir.join("bin");
        fs::create_dir_all(&bin_dir)?;
        let node_exe_name = if cfg!(windows) { "node.exe" } else { "node" };
        let node_dest = bin_dir.join(node_exe_name);
        fs::write(&node_dest, NODE_BINARY)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = fs::metadata(&node_dest) {
                let mut perms = meta.permissions();
                perms.set_mode(0o755);
                let _ = fs::set_permissions(&node_dest, perms);
            }
        }
    }

    Ok(())
}

/// Recursively write an [`include_dir::Dir`] to `dest`, creating directories as needed.
#[cfg(feature = "embed-web")]
fn extract_dir(dir: &include_dir::Dir<'_>, dest: &std::path::Path) -> anyhow::Result<()> {
    use include_dir::DirEntry;
    use std::fs;

    fs::create_dir_all(dest)?;
    for entry in dir.entries() {
        match entry {
            DirEntry::File(f) => {
                // Use only the file's own name, not the full relative path stored
                // inside the Dir, so we don't accidentally create nested dirs here
                // (recursive calls handle sub-directories separately).
                let name = f
                    .path()
                    .file_name()
                    .unwrap_or_else(|| f.path().as_os_str());
                fs::write(dest.join(name), f.contents())?;
            }
            DirEntry::Dir(sub) => {
                let sub_name = sub
                    .path()
                    .file_name()
                    .unwrap_or_else(|| sub.path().as_os_str());
                extract_dir(sub, &dest.join(sub_name))?;
            }
        }
    }
    Ok(())
}
