# XianScan Developer Guide

This guide covers building from source, fast iteration workflows, hardware acceleration feature flags, environment variables, database tooling, browser extension development, test suites, and REST API references.

---

## Prerequisites

### 1. Core Toolchains
- **Rust 1.88+** (with Cargo & rustup):
  ```bash
  rustup update stable
  ```
- **Node.js 20+** & **Yarn** (for the SvelteKit frontend studio & extensions):
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
# 1. Build the SvelteKit web interface
cd web && yarn install && yarn build && cd ..

# 2. Compile standalone binary with embedded models & web assets
cargo build --release --features embed-models,embed-web
```

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
- **Backend Rust ML Engine**: `http://localhost:8123`

### 2. Backend ML-Only Mode
Launches strictly the Rust Axum ML engine without spawning the Node.js/SvelteKit SSR process (useful for API testing, headless servers, or external frontend development):
```bash
cargo run -- --ml-only
```

---

## Environment Variables & CLI Options

| Option / Variable | Default | Description |
| :--- | :--- | :--- |
| `--dev` / `-d` (`DEV_MODE=1`) | `false` | Runs Vite in live development mode with Hot Module Reloading (HMR). |
| `--ml-only` / `-m` (`ML_ONLY=1`) | `false` | Disables the internal SvelteKit SSR server; starts only the Rust ML engine. |
| `PORT` | `8124` | Port for the standalone production SvelteKit Web UI & SSR server. |
| `DEV_PORT` | `8125` | Port for the Vite Live HMR dev server in `--dev` mode. |
| `ML_PORT` | `8123` | Port for the internal Rust Axum ML engine. |
| `DATA_ROOT` | `%APPDATA%\XianScan\data` (or OS local data dir) | Directory where books, chapter image caches, and covers are stored. |
| `DATABASE_PATH` | `$DATA_ROOT/xianscan.db` | Path to the SQLite database file. |
| `MODELS_DIR` | `./models` | Directory containing ONNX models (when not using embedded weights). |
| `VERBOSE_LOGGING` | `0` | Set to `1` to enable verbose request and SSR logging in the terminal. |

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
- **JDK 17+**
- **Android SDK** (with `build-tools 34.0.0` or higher)

### 2. Building the Extension APK
```bash
cd extensions/xianscan-mihon

# Compile Debug APK (app/build/outputs/apk/debug/app-debug.apk)
./gradlew :app:assembleDebug   # On Windows: .\gradlew.bat :app:assembleDebug

# Compile Signed Release APK (app/build/outputs/apk/release/)
./gradlew :app:assembleRelease # On Windows: .\gradlew.bat :app:assembleRelease
```

### 3. Server API Contracts for Mihon
The SvelteKit server implements the following endpoints to serve the extension:

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

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | `GET` | Health status, active hardware backend, and loaded model diagnostics. |
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

### 2. SvelteKit Backend API Routes (`:8124`)

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/books` | `GET`, `POST`, `DELETE` | Book metadata CRUD and library management. |
| `/api/chapters` | `GET`, `POST`, `DELETE` | Chapter page uploads, status tracking, and batch translation queues. |
| `/api/covers` | `GET`, `POST` | Dedicated book cover image extraction, caching, and serving. |
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
