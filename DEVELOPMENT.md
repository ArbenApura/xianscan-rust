# XianScan Developer Guide

This guide covers building from source, fast iteration workflows, hardware acceleration feature flags, environment variables, database tooling, browser extension development, test suites, and REST API references.

---

## Prerequisites

### 1. Core Toolchains
- **Rust 1.88+** (with Cargo & rustup):
  ```bash
  rustup update stable
  ```
- **Node.js 24** (the exact version is pinned in `.nvmrc`; release builds embed that runtime) & **Yarn** (for the SvelteKit frontend studio & extensions):
  ```bash
  corepack enable
  yarn --version
  ```
- **Git** (with Git LFS if managing raw model weights or regression fixtures).

### 2. Linux Native Dependencies
On Linux (Ubuntu / Debian / Fedora), native node addons (`better-sqlite3` and `@napi-rs/canvas` Skia bindings) require the following system packages:
```bash
sudo apt-get update -y
sudo apt-get install -y build-essential python3 libfontconfig1-dev
```

---

## Building from Source

### 1. Standalone Release Build
Compile the complete self-contained release binary with the SvelteKit frontend and ONNX models embedded:

```bash
# 0. Fetch the pinned ONNX models (sizes and SHA-256 in models/manifest.tsv)
bash scripts/fetch-models.sh

# 1. Build the SvelteKit web interface
cd web && yarn install && yarn build && cd ..

# 2. Stage the Node.js runtime that gets embedded (must be the .nvmrc version)
mkdir -p web/bin && cp "$(which node)" web/bin/node   # web/bin/node.exe on Windows

# 3. Compile standalone binary with embedded models & web assets
cargo build --release --features embed-models,embed-web
```

`embed-models` builds check every model against `models/manifest.tsv` and fail on a missing or different file (set `XIANSCAN_SKIP_MODEL_HASH=1` to skip the check for local experiments only).
`bash scripts/fetch-models.sh --verify-only` checks what is in `models/` without downloading anything.

An `embed-web` binary extracts its web app and Node runtime to `XIANSCAN_APP_DIR` and verifies the extracted files byte for byte on every start (a modified copy is re-extracted). `xianscan --extract-only` only extracts and exits (exit `0` ok, `1` failed, `2` binary built without `embed-web`); the Docker image uses it at build time.

On Windows, local links can be faster with LLVM's linker. This is a per-developer choice, not a repo setting (CI links with MSVC `link.exe`): add `[target.x86_64-pc-windows-msvc] linker = "rust-lld.exe"` to your user-level `~/.cargo/config.toml`.

The compiled binary will be located at `target/release/xianscan` (`.exe` on Windows).

### 2. GPU Hardware Acceleration Feature Flags
To enable platform-specific GPU acceleration backends, add the corresponding Cargo feature flag:

| Platform | Acceleration Flag | Build Command |
| :--- | :--- | :--- |
| **Windows** | `directml` | `cargo build --release --features embed-models,embed-web,directml` |
| **Linux (NVIDIA)** | `cuda` | `cargo build --release --features embed-models,embed-web,cuda` |
| **macOS (Apple Silicon)** | `coreml` | `cargo build --release --features embed-models,embed-web,coreml` |

> [!NOTE]
> All GPU acceleration features fall back to the multi-threaded SIMD CPU engine if the respective hardware or runtime driver is not present.
>
> **DirectML Dimension Bucketing**: On Windows, dynamic tensor shapes can trigger repeated DirectX 12 PSO (Pipeline State Object) shader recompilations. XianScan enforces 64px dimension bucketing for LaMa inpainting patches (`lama.rs`) and 128px width bucketing for OCR crops (`ocr/engine.rs`). This allows DirectX 12 compute shaders to be compiled once and cached, reducing inpainting latency from 7s to 0.11s.

---

## Fast Iteration Dev Workflows

### 1. Full-Stack Dev Mode (Rust ML Engine + Vite Live HMR)
Runs the Rust ML server (`:8123`) and Vite Live HMR (`:8125`) concurrently with automatic reverse-proxying:
```bash
cargo run -- --dev
```
- **Frontend UI (Vite Live HMR)**: `http://localhost:8125`
- **Backend Rust ML Engine**: `http://127.0.0.1:8123` (internal: browsers are refused; `GET /health` is open for checks)

### 2. Backend ML-Only Mode
Launches strictly the Rust Axum ML engine without spawning the Node.js/SvelteKit SSR process (useful for API testing, headless servers, or external frontend development):
```bash
cargo run -- --ml-only
```
The ML engine then writes its shared secret to `<app data>/data/ml-secret` (for example `%APPDATA%\XianScan\data\ml-secret`, regardless of `DATA_ROOT`); `yarn dev` reads it from its own `DATA_ROOT`, so leave `DATA_ROOT` at the default app data directory for this split setup. The dev server listens on `127.0.0.1` unless you run `HOST=0.0.0.0 yarn dev`.

---

## Environment Variables & CLI Options

| Option / Variable | Default | Description |
| :--- | :--- | :--- |
| `--dev` / `-d` (`DEV_MODE=1`) | `false` | Runs Vite in live development mode with Hot Module Reloading (HMR). |
| `--ml-only` / `-m` (`ML_ONLY=1` or `NO_SSR=1`) | `false` | Disables the internal SvelteKit SSR server; starts only the Rust ML engine. |
| `--extract-only` | | Extracts the embedded web app and Node runtime to `XIANSCAN_APP_DIR`, then exits (see above). |
| `PORT` | `8124` | Port for the standalone production SvelteKit Web UI & SSR server. |
| `DEV_PORT` | `8125` | Port for the Vite Live HMR dev server in `--dev` mode. |
| `ML_PORT` | `8123` | Port for the internal Rust Axum ML engine. |
| `DATA_ROOT` | `%APPDATA%\XianScan\data` (or OS local data dir) | Directory where books, chapter image caches, and covers are stored. |
| `DATABASE_PATH` | `$DATA_ROOT/xianscan.db` | Path to the SQLite database file. |
| `MODELS_DIR` | `./models` | Directory containing ONNX models (when not using embedded weights). |
| `WEB_DIR` | | On-disk SvelteKit build to serve when the binary has no embedded web app. |
| `XIANSCAN_APP_DIR` | `<app data>/app` | Where an `embed-web` binary extracts its web app and Node runtime. The Docker image sets `/app/runtime` (root-owned, verified on every start). |
| `LOG_REQUESTS` | `0` | Set to `1` to enable verbose request and SSR logging in the terminal. |
| `--lan` (`XIANSCAN_BIND=lan`) | off | Listen on every network interface so other devices can connect (they need the access token). `XIANSCAN_BIND=local` forces loopback. Order of precedence: `--lan`, then `XIANSCAN_BIND`, then Docker (always LAN), then the **Settings -> Network & Access** choice, then LAN for an existing install that has a library but no stored choice, then loopback. |
| `--print-token` | | Prints the access token and exits (for Docker and headless servers). |
| `ACCESS_TOKEN_PATH` | `<app data>/data/access-token` | File holding the access token (created on first start, mode `0600` on Unix). The binary always sets it to the app data path (ignoring `DATA_ROOT`); only `yarn dev` honours an override (default `$DATA_ROOT/access-token`). |
| `XIANSCAN_TRUST_LOOPBACK` | `1` | Set to `0` to require the token even for requests from this machine. |
| `ML_SHARED_SECRET` | random per run | Secret the web server sends to the ML engine in `X-XianScan-Ml-Secret` (at least 32 characters when set; shorter values are ignored). |
| `XIANSCAN_MAX_IMAGE_MP` | `100` | Per-image limit in megapixels for the ML engine. |
| `XIANSCAN_MAX_RESLICE_MP` | `200` | Stitched reslice canvas limit in megapixels. |
| `MT_DEVICE` | auto | Execution device (`cpu`, `cuda`, `coreml`, `directml`); the device chosen in Settings takes precedence. |
| `ONNX_THREADS` | cores, max 8 | ONNX Runtime threads for CPU sessions. |
| `ONNX_GPU_THREADS` | cores, max 4 | Host threads for GPU sessions. |
| `ORT_CUDA_MEM_LIMIT_MB` | per model | CUDA memory limit in MB (the VRAM limit set in Settings takes precedence). |
| `MT_FAST_CPU` | `1` | Set to `0` to turn off ONNX Runtime's CPU memory arena and memory-pattern optimizations. |
| `PIPELINE_PAGE_CONCURRENCY` | `3` | Pages the chapter pipeline processes in parallel. |
| `XIANSCAN_BIND` | | `lan` or `local`; see `--lan` above. |

### Process Supervision
- The web server (Node) is tied to the XianScan process: it exits when XianScan exits or is killed (Windows job object, Linux parent-death signal, stdin watchdog).
- If the web server crashes, XianScan restarts it after 1 s, doubling up to 60 s while crashes repeat within a minute; a run that stayed up for 2 minutes resets the delay. An uncaught exception in production exits Node with code `70`, which is logged before the restart.
- If the web port is already taken (usually an orphaned web server from an earlier crash), XianScan prints the command to find the process (`netstat -ano | findstr :8124` on Windows, `lsof -nP -iTCP:8124 -sTCP:LISTEN` elsewhere). It never kills it: stop it or set `PORT`.

---

## Database & Schema Migrations (Drizzle ORM)

The SvelteKit server uses **Drizzle ORM** with **SQLite** (`better-sqlite3`). Database scripts are managed from `web/`:

```bash
cd web

# Push schema changes directly to the SQLite database
yarn db:push

# Generate Drizzle migration files
yarn db:generate

# Open interactive visual Drizzle Studio web GUI
yarn db:studio
```

---

## Browser Extension Development (`extensions/xianscan-importer/`)

The 1-Click Web Importer is built with TypeScript and esbuild:

```bash
cd extensions/xianscan-importer
yarn install

# Build Chromium and Firefox distributions (dist/ and dist-firefox/)
yarn build

# Watch mode for extension development
yarn watch

# Run extension noise-filtering unit tests
yarn test

# Package .zip and .xpi release archives into store/
yarn package
```

---

## Android Mihon / Tachiyomi Extension (`extensions/xianscan-mihon/`)

The mobile companion extension is an Android Kotlin library built on the Tachiyomi Extension API:

### 1. Prerequisites
- **JDK 21** (as CI uses)
- **Android SDK** (platform 34, `build-tools 34.0.0` or higher; `dexdump` from build-tools is used by `scripts/verify-apk.sh`)

### 2. Building the Extension APK
```bash
cd extensions/xianscan-mihon

# Compile Debug APK (app/build/outputs/apk/debug/tachiyomi-all.xianscan-v<version>-debug.apk)
./gradlew :app:assembleDebug   # On Windows: .\gradlew.bat :app:assembleDebug

# Compile Signed Release APK (app/build/outputs/apk/release/tachiyomi-all.xianscan-v<version>-release.apk)
./gradlew :app:assembleRelease # On Windows: .\gradlew.bat :app:assembleRelease

# Check the APK bundles only XianScan's own classes (no Kotlin stdlib or host libraries)
bash scripts/verify-apk.sh
```

Every dependency is `compileOnly`: the host app provides Kotlin and all libraries.

### 3. Server API Contracts for Mihon
The SvelteKit server implements the following endpoints to serve the extension. The extension sends the access token in an `X-XianScan-Token` header (only to the configured server host):

| Route | Description |
| :--- | :--- |
| `GET /api/mihon/library?page=N` | Paginated recent-first book library (`SManga` list). |
| `GET /api/mihon/search?q=&page=N` | Multi-keyword book search. |
| `GET /api/mihon/manga/:id` | Full book details (description, authors, genres, cover URL). |
| `GET /api/mihon/manga/:id/chapters` | Chapter list and reading order. |
| `GET /api/mihon/chapters/:id/pages` | Direct image URLs for pages in the chapter. |
| `GET /api/mihon/genres` | Category tags and genre filter lists. |
| `GET /api/covers/:id/file?w=512` | High-res cover thumbnails with auto-fallback to page 1. |

---

## Testing Protocols

### 1. Rust Unit & Integration Tests
```bash
# Run all core Rust unit and integration tests
cargo test -- --nocapture
```

Release and packaging checks:
```bash
# Models in models/ match models/manifest.tsv (no download)
bash scripts/fetch-models.sh --verify-only

# Cargo.toml, web/package.json, Cargo.lock (and optionally a tag) agree on the version
bash scripts/check-release-version.sh
```

### 2. 10-Language ML Regression Suite
Runs the full multi-language OCR and bubble detection regression suite against cached fixtures:
```bash
cargo test --test regression -- --nocapture
```

### 3. Frontend Web Tests & Type Checking
```bash
cd web

# Run Vitest component and API route tests
yarn test

# Run SvelteKit TypeScript type checking
yarn check

# Run ESLint & Prettier code style checks
yarn lint
```

---

## REST API Reference

### 1. Rust Axum ML Engine Endpoints (`:8123`)

The ML engine is **internal**: it listens on `127.0.0.1` only, rejects browser requests (`Origin` / `Sec-Fetch-Site`) and foreign `Host` headers, and every route except `GET /health` requires the `X-XianScan-Ml-Secret` header. Use the web API below instead of calling it directly.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | `GET` | Health status, active hardware backend, loaded model diagnostics, `models_dir`, and input `limits`. |
| `/system/hardware` | `GET` | GPU adapter enumeration and hardware capabilities. |
| `/system/device` | `POST` | Dynamically switch execution provider (`auto`, `cuda`, `coreml`, `directml`, `cpu`). |
| `/pages/analyze` | `POST` | Speech bubble detection, polygon segmentation, and multi-language OCR. |
| `/pages/clean` | `POST` | Neural inpainting to erase text from selected bubble masks. |
| `/pages/preprocess` | `POST` | Image normalization and contrast optimization. |
| `/pages/stitch` | `POST` | Vertically stitch individual pages into seamless webtoon strips. |
| `/pages/reslice` | `POST` | Split tall webtoon strips into pages along panel gutters. |
| `/pages/reslice/status` | `GET` | Poll progress of the running (blocking) reslice job. |
| `/pages/reslice/reset` | `POST` | Clear stale reslice progress and begin a fresh run. |
| `/pages/reslice/cancel` | `POST` | Cancel the in-flight reslice run. |
| `/system/telemetry` | `GET` | Active and queued OCR jobs, CPU and RAM stats. |

**Input limits** (reported by `/health`): 100 megapixels per image (`XIANSCAN_MAX_IMAGE_MP`), 400 images and a 200-megapixel stitched canvas per reslice (`XIANSCAN_MAX_RESLICE_MP`), and request bodies up to 512 MiB for reslice, 128 MiB for stitch and 64 MiB for single-image routes. Too many images, a canvas or body over its limit returns `413`; an undecodable image or one over the per-image limit returns `422`.

### 2. SvelteKit Backend API Routes (`:8124`)

Requests from this machine are trusted when they are addressed to `localhost`, `127.0.0.1` or `[::1]` and carry no proxy headers (so a reverse proxy or tunnel on the same machine is not trusted). Everything else, including browser extensions, must send the access token as `Authorization: Bearer <token>` (or `X-XianScan-Token: <token>`); browsers unlock once on `/unlock`. Cross-origin (CORS) access is granted only to browser extension origins. For example:

```bash
curl -H "Authorization: Bearer $XIANSCAN_TOKEN" http://192.168.1.10:8124/api/books
```

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/books` | `GET`, `POST` | List and create books (`/api/books/:id` for `GET`, `PATCH`, `DELETE`). |
| `/api/chapters/:id` | `GET`, `PATCH`, `DELETE` | Chapter details; sub-routes for pages, translate (SSE progress), reslice, and reset. |
| `/api/chapters/:id/download` | `GET` | Chapter ZIP; unreadable pages are listed in `MISSING_PAGES.txt` and the `x-missing-pages` header. |
| `/api/covers/:bookId` | `POST`, `DELETE` | Upload or remove a dedicated cover (`/api/covers/:bookId/file` serves it). |
| `/api/auth/unlock` | `POST` | Exchange the access token for a browser session cookie (`/api/auth/status`, `/api/auth/logout`). |
| `/api/system/access` | `GET`, `PATCH` | LAN access setting, token and network addresses (`POST /api/system/access/token/regenerate` replaces the token). |
| `/api/system/fonts/coverage` | `GET` | Per-script font chain and covering fonts; `accent` lists each accent font with the sample letters it lacks (`?accentFonts=` overrides the saved ones). |
| `/api/system/fonts/book-scripts` | `GET` | Scripts the library's books are typeset in (rows of the Fonts table). |
| `/api/typeset/preview` | `POST` | Exact typeset preview rendered by the server; optional `mode: "accent"` draws the text as an accent callout instead of a bubble; optional `accentText` adds an accent sample below the bubble. |
| `/api/glossary` | `GET`, `POST`, `DELETE` | Dynamic terminology glossary CRUD (Aho-Corasick matching). |
| `/api/translate-text` | `POST` | Context-aware LLM dialogue translation (Ollama, LM Studio, Cloud APIs). |
| `/api/mihon/*` | `GET` | Mihon / Tachiyomi mobile reader source repository and chapter stream. |

---

## Project Architecture

```
xianscan-rust/
├── src/
│   ├── ml/                 # ONNX Runtime ML inference (Koharu RF-DETR, OCR, LaMa, Hardware Providers)
│   ├── pipeline/           # Detection + OCR fusion, polygon masking, region builder, line filters
│   └── server/             # Axum REST router, SvelteKit SSR process manager, embedded web assets
├── web/                    # SvelteKit 2 + Svelte 4 frontend studio & Typesetting engine
│   ├── src/lib/components/ # Reader, Typesetting studio, Canvas inpainting, Settings modals
│   ├── src/lib/server/     # Drizzle ORM (SQLite), Ollama/LLM clients, glossary matcher (Aho-Corasick)
│   └── src/routes/api/     # SvelteKit backend API endpoints
├── extensions/
│   ├── xianscan-importer/  # 1-Click Browser Web Extension (Chromium & Firefox)
│   └── xianscan-mihon/     # Mihon / Tachiyomi Android extension repository
└── models/                 # Pre-trained ONNX neural network model weights
```

---

## Documentation Site (`docs-site/`)

```bash
cd docs-site
yarn install
yarn dev     # http://localhost:8126
yarn build
```

Showcase images live only in `docs/showcase/` (the root README links them there). `yarn dev` and `yarn build` first run `scripts/sync-showcase.js`, which copies them into the git-ignored `docs-site/static/showcase/`. Add new images to `docs/showcase/`.
