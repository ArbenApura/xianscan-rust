<div align="center">

# 🏮 XianScan-Rust (仙Scan)

**Native High-Performance Unified Comic & Manhua Translation Server**

*End-to-end automated text detection, multi-language OCR, DeepSeek translation with glossary consistency, AI inpainting, and studio-grade typesetting — compiled into a zero-dependency native executable.*

<br/>

[![Rust](https://img.shields.io/badge/Rust-1.80+-DEA584?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-1.19+-005CED?style=for-the-badge&logo=onnx&logoColor=white)](https://onnxruntime.ai/)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2.x-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![Platforms](https://img.shields.io/badge/Platform-Windows_•_Linux_•_macOS-success?style=for-the-badge)](https://github.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

</div>

---

## 📖 Overview

**XianScan-Rust** is a unified, native Rust server that translates raw Chinese, Japanese, and Korean webtoons, manhua, and manga into polished English with natural dialogue flow and authentic comic book typography.

By replacing Python with native Rust, the entire application runs as a **single compiled binary** with in-memory zero-copy tensor execution, sub-second startup, and zero system dependencies.

```
Remote Clients (Phones, Tablets, Laptops on LAN / Internet)
   │  HTTP / REST / SSE Stream (:8124)
   ▼
Unified Native Server (xianscan-rust.exe)
   ├─ Axum HTTP Server & Static Asset Streamer
   ├─ SQLite Storage (Books, Chapters, Glossaries, Cache)
   └─ In-Memory Native ML Pipeline (ort / ONNX Runtime)
        ├─ ComicTextDetector (DBNet) ➔ Bounding boxes, polygons, angle rotation
        ├─ RapidOCR (PP-OCRv4 + CTC) ➔ 18,710-character CJK/Latin decoding
        └─ LaMa Inpainting (Big-LaMa)➔ Background synthesis (text erased)
```

---

## ⚡ Why the Native Rust Architecture?

- **🚫 Zero Python & Node.js Runtime Dependencies**: No `pip`, no `.venv`, no `node_modules` required for end users. Download the executable and run.
- **🚀 15x Lower Memory Footprint**: Idle memory drops from ~600MB–850MB (Python + Node.js) down to **~35MB–55MB**.
- **⚡ Instant Startup**: Starts and binds to `0.0.0.0:8124` in **less than 30 milliseconds**.
- **🛡️ Built-In Hardware & iGPU Protection**: Native DXGI adapter enumeration automatically classifies dedicated GPUs (NVIDIA RTX / Radeon RX) from integrated APUs (Intel Iris / AMD Radeon Graphics), routing iGPUs to multi-threaded CPU to eliminate desktop lag and driver crashes.
- **🌐 Headless LAN & Remote Server**: Accessible from any phone, tablet, or PC on your home network or via Cloudflare / Tailscale tunnels.

---

## ✨ Key Features

- **⚡ Universal Hardware Acceleration & Pure CPU Compatibility**:
  - **Works on any PC out of the box with multi-threaded CPU SIMD** — no expensive dedicated GPU required.
  - **Auto-Accelerated**: Automatically harnesses Dedicated NVIDIA CUDA, AMD Radeon RX, or Apple Silicon when present.
- **🎯 Precision Speech Bubble Detection & OCR**:
  - Combines **ComicTextDetector (CTD)** for bubble segmentation and polygon bounding with **RapidOCR (PP-OCRv4)** for multi-line text reading.
  - Intelligent polygon mask growth recovers faint trailing dots (`……`), scream marks (`！`), and multiline speech bubbles.
- **🤖 Context-Aware DeepSeek LLM Translation**:
  - Powered by **DeepSeek V3 / R1** with custom prompts tailored for manhua martial-arts terms, honorifics, and narrative tone.
  - **Aho-Corasick Dynamic Glossary Matching**: Injects character names, cultivation ranks, and faction terminology to guarantee cross-chapter naming consistency.
- **🎨 High-Fidelity AI Inpainting**:
  - Uses the **Big-LaMa ONNX** inpainting network to cleanly remove original text and restore background artwork with zero ghosting.
- **✍️ Studio-Grade Canvas Typesetting**:
  - Automatically formats text using the standard **CC Wild Words** comic typeface with dynamic font-size fitting, line-height balancing, and rotation alignment.

---

## ⚡ Quick Start

### 🪟 Windows
Run the standalone executable or launch via Cargo:
```powershell
.\target\release\xianscan-rust.exe
# Or build & run directly:
cargo run --release --features embed-models
```

### 🐧 Linux / 🍏 macOS
```bash
./target/release/xianscan-rust
# Or build & run directly:
cargo run --release --features embed-models
```

Open **[http://localhost:8124](http://localhost:8124)** in your browser!

---

## 📦 Multi-Platform Executable Downloads

Pre-compiled release binaries are available for all major platforms:

| Platform | Architecture | Binary Package |
| :--- | :--- | :--- |
| **Windows** | 64-bit (`x86_64`) | `xianscan-v0.1.0-windows-x86_64.zip` |
| **Linux** | 64-bit (`x86_64` - Ubuntu, Debian, Fedora, Arch) | `xianscan-v0.1.0-linux-x86_64.tar.gz` |
| **macOS** | Apple Silicon (`aarch64` - M1, M2, M3, M4) | `xianscan-v0.1.0-macos-arm64.tar.gz` |

---

## 🛠️ Building from Source (Developers)

### 1. Prerequisites
- **Rust Toolchain**: 1.80+ (`rustup install stable`)

### 2. Compile Release Binary
```bash
# Clone the repository
git clone https://github.com/your-username/xianscan-rust.git
cd xianscan-rust

# Build optimized release binary
cargo build --release
```
The compiled standalone binary will be generated at:
- **Windows**: `target/release/xianscan-rust.exe`
- **Linux / macOS**: `target/release/xianscan-rust`

## 📦 Packaging & Production Distribution

XianScan is built to run as a **self-contained, zero-dependency single executable** (containing the Rust ML backend, SvelteKit SSR frontend, native `.node` addons, fonts, and AI models).

### Build Formats:

#### Option A: Standalone 1-File Release (All Embedded)
Produces a single binary with all models and web assets compiled directly inside:
```bash
# 1. Build SvelteKit frontend
cd web && yarn install && yarn build && cd ..

# 2. Compile standalone release binary
cargo build --release --features embed-models,embed-web
```
- **Windows**: `target/release/xianscan-rust.exe`
- **Linux / macOS**: `target/release/xianscan-rust`
- **How it works at runtime**: On first launch, web assets & runtime dependencies self-extract to the user AppData directory (`%APPDATA%/XianScan/app/` on Windows, `~/.local/share/xianscan/app/` on Linux, `~/Library/Application Support/XianScan/app/` on macOS). Subsequent launches use cached assets instantly.

#### Option B: Modular Release (Lightweight Binary + External Models)
```bash
cargo build --release
```
Place the compiled executable next to the `models/` directory:
```
xianscan-prod/
├── xianscan-rust.exe          # (~26 MB)
└── models/                    # (~317 MB)
    ├── comictextdetector.pt.onnx
    ├── PP-OCRv6_det_small.onnx
    ├── PP-OCRv6_rec_small.onnx
    ├── lama.onnx
    └── rapidocr_keys.json
```

---

## 🗄️ Database & Storage Architecture

XianScan uses **SQLite** with **Drizzle ORM** and [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) with Write-Ahead Logging (WAL) enabled:

| Environment | Database Location | Notes |
| :--- | :--- | :--- |
| **All Modes (Dev / Prod)** | `%APPDATA%/XianScan/data/xianscan.db` | System AppData directory (auto-runs pending migrations on boot). |
| **Vitest Tests (`yarn test`)** | `:memory:` | Ephemeral in-memory database. |
| **Custom Path Override** | Set `DATABASE_PATH=...` in `.env` | Custom SQLite file location if desired. |

---

## 🛠️ Development & Fast Iteration Workflow

| Workflow | Command | Web UI Mode | Rust Backend Mode |
| :--- | :--- | :--- | :--- |
| **🚀 Single-Command Dev (Recommended)** | `cargo run -- --dev` | **Vite Live HMR** (`yarn dev`) | Dev profile (Static) |
| **🔄 Full Hot-Reload (Rust + Web HMR)** | `cargo watch -w src -x "run -- --dev"` | **Vite Live HMR** (`yarn dev`) | Auto-recompiles on `.rs` change |
| **📦 Rust Hot-Reload + Compiled Web Build** | `cargo watch -w src -x run` | Pre-compiled SSR (`web/build/`) | Auto-recompiles on `.rs` change |
| **⚡ Standalone ML Backend Only** | `cargo watch -w src -x "run -- --ml-only"` | *Disabled* (connect your own `yarn dev`) | Auto-recompiles on `.rs` change |
| **🏭 Standard Unified Run** | `cargo run` | Pre-compiled SSR (`web/build/`) | Dev profile (Static) |

---

### Detailed Usage:

#### 1. Live Dev Mode (Frontend HMR + ML Engine)
Starts both the native ML sidecar (`:8123`) and the live Vite dev server (`:8124`) in **one single command**:
```bash
cargo run -- --dev

# Or with automatic Rust recompilation whenever .rs files change:
cargo watch -w src -x "run -- --dev"
```

#### 2. Serving the Pre-Compiled Web Build
When testing production SSR behavior or after running `cd web && yarn build`:
```bash
# Serves pre-compiled web/build/ on :8124 with Rust auto-reloading:
cargo watch -w src -x run

# Or run once without auto-reloading:
cargo run
```

#### 3. Running Web UI and Rust in Separate Terminals (Optional)
* **Terminal 1 (ML Backend)**: `cargo watch -w src -x "run -- --ml-only"`
* **Terminal 2 (Web UI)**: `cd web && yarn dev`

---

### Fast Commands for Developers:

```bash
# Instant type-checking (~0.5s)
cargo check

# Run Rust test suites
cargo test -- --nocapture

# Run Web UI unit tests (Vitest with in-memory SQLite)
cd web && yarn test
```

---

## 🧪 Testing & Validation

The codebase includes an extensive automated test suite with mock fixtures and real-page regression samples:

```bash
# Run all native unit & integration test suites
cargo test -- --nocapture
```

Test suites verified:
- `tests/api_endpoints.rs`: `/health` and `/system/hardware` endpoints.
- `tests/detect.rs`: ComicTextDetector ONNX inference on `page_679.jpg`.
- `tests/geometry.rs`: Rotated angle calculation, bounding box IoU, and vertical text detection.
- `tests/inpaint.rs`: LaMa neural inpainting.
- `tests/pipeline.rs`: End-to-end detection, OCR, and inpainting on manga pages.
- `tests/regression_pages.rs`: Real manga page regression fixtures (`page_679`, `page_683`, `page_688`).
- `tests/reslice.rs`: Gutter interval merging, forbidden zones, and vertical stitching.
- `tests/schemas.rs`: JSON serialization parity for data contracts.
- `tests/watermark.rs`: Edge stamp detection and keyword suppression.

---

## 📜 Licenses & Acknowledgments

All bundled code in this repository is licensed under the **[MIT License](LICENSE)** (Copyright © 2026 Arben Apura).

Upstream AI models, weights, and tools are acknowledged under their respective open-source licenses:
- **ComicTextDetector**: Model weights and text detection architecture adapted from [manga-image-translator](https://github.com/zyddnys/manga-image-translator) (GPL-3.0).
- **RapidOCR Engine**: PP-OCRv4 ONNX models and inference by [RapidOCR](https://github.com/RapidAI/RapidOCR) (Apache-2.0).
- **LaMa Inpainting**: Large Mask Inpainting model by [advimman/lama](https://github.com/advimman/lama) & [Sanster/models](https://github.com/Sanster/models) (Apache-2.0).
- **Comic Fonts**: CC Wild Words & Friendly Sans under the Open Font License (OFL-1.1).
