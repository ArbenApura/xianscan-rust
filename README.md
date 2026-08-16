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

## ⚡ Quick Start (1-Click)

### 🪟 Windows
Simply double-click `start.bat`:
```cmd
start.bat
```

### 🐧 Linux / 🍏 macOS
```bash
chmod +x start.sh
./start.sh
```

---

## 📦 Multi-Platform Executable Downloads

Pre-compiled release binaries are available for all major platforms:

| Platform | Architecture | Binary Package |
| :--- | :--- | :--- |
| **Windows** | 64-bit (`x86_64`) | `xianscan-v0.1.0-windows-x86_64.zip` |
| **Linux** | 64-bit (`x86_64` - Ubuntu, Debian, Fedora, Arch) | `xianscan-v0.1.0-linux-x86_64.tar.gz` |
| **macOS** | Apple Silicon (`aarch64` - M1, M2, M3, M4) | `xianscan-v0.1.0-macos-arm64.tar.gz` |
| **macOS** | Intel (`x86_64`) | `xianscan-v0.1.0-macos-x86_64.tar.gz` |

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

## 🚀 Production Release & Deployment Guide

You can build XianScan in two different production distribution formats:

### Option A: 100% Standalone Single Executable (All Models Baked In)
Produces a single **`xianscan-rust.exe` (~342 MB)** that contains all neural network weights (ComicTextDetector, PP-OCR, LaMa) compiled directly into the binary:

```bash
# Build 1-file standalone binary with embedded AI models
cargo build --release --features embed-models
```
- **Benefits**: **Zero external files or folders required**. You can copy literally just `xianscan-rust.exe` anywhere and double-click to run.
- **Smart Runtime Override**: If a `./models/` folder is placed next to the executable, it will use the disk files; otherwise, it seamlessly uses the embedded binary weights.

### Option B: Modular Release (~26 MB Executable + External Models Folder)
Produces a lightweight binary with external model weights:

```bash
# 1. Build the SvelteKit frontend (if modifying web UI)
cd web && npm run build && cd ..

# 2. Build the lightweight native Rust binary
cargo build --release
```
- **Distribution Layout**: Place `xianscan-rust.exe` alongside the `models/` directory:
```
xianscan-prod/
├── xianscan-rust.exe          # (~26 MB)
├── DirectML.dll               # (~17.7 MB - optional for Windows GPU)
└── models/                    # (~317 MB total)
    ├── comictextdetector.pt.onnx
    ├── PP-OCRv6_det_small.onnx
    ├── PP-OCRv6_rec_small.onnx
    ├── lama.onnx
    └── rapidocr_keys.json
```

### 3. Production Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8124` | The web UI and SSR server port (accessible over LAN/WAN). |
| `ML_PORT` | `8123` | Internal native ML sidecar pipeline port. |
| `MODELS_DIR` | `./models` | Path to ONNX model weights folder. |
| `WEB_DIR` | `./web` | Path to the web application directory containing `build/`. |
| `DATABASE_PATH` | `./xianscan.db` | Path to the SQLite database file. |

### 4. Running in Production
```bash
# Windows
./target/release/xianscan-rust.exe

# Linux (systemd / nohup)
nohup ./target/release/xianscan-rust > xianscan.log 2>&1 &
```
- **Web UI & Reader**: `http://localhost:8124` (or `http://<your-lan-ip>:8124` from any phone or tablet on your network)
- **ML Pipeline Backend**: `http://127.0.0.1:8123`

---

### 5. Running Production and Development Simultaneously

If you want to run both a **Production instance** and a **Development instance** on the same machine without port collisions, use custom environment variables:

```powershell
# In PowerShell:
$env:PORT="9000"
$env:ML_PORT="9001"
.\target\release\xianscan-rust.exe
```
Now your Production server runs on `http://localhost:9000`, while your Dev server runs untouched on default ports `8124`/`5173`.

---

### 🎨 Inpainting Strategies (Configurable in Web UI)

XianScan supports 3 distinct AI text erasure and background inpainting strategies selectable in the Web UI Settings modal:

| Mode | Strategy | How It Operates | Best Use Case |
| :--- | :--- | :--- | :--- |
| **`patch`** *(Default)* | **Localized 1:1 Bubble Crops** | Isolates 8-connected speech bubble components with $+24\text{px}$ padding. Runs at native resolution while leaving the other ~98% of page artwork 100% untouched. | **Fastest (~100–300ms)**. Recommended for 95% of standard dialogue pages. |
| **`scaled`** | **Balanced 512×512 Resampling** | Downsamples canvas and mask to $512\times 512$, executes exactly 1 LaMa ONNX forward pass, and upscales via Catmull-Rom bicubic interpolation. | **Predictable constant time (~300–500ms)**. Great for low-end CPUs or pages with dozens of scattered sound effects. |
| **`full`** | **Global Dynamic Full Canvas** | Pads the entire native resolution image to modulo 8 and synthesizes global background texture in a single full-page pass. | **Maximum artistic context (~3–5s on CPU, ~80ms on GPU)**. Ideal for complex art spreads and large sound effects over detailed illustrations. |

---

## 🛠️ Development & Fast Iteration Workflow

The repository is pre-configured with **split optimization profiles** and the **LLD fast linker**, enabling instant sub-second build times during local development:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Cargo.toml Developer Optimization Architecture:                       │
│  • External Crates (ort, image, axum, tokio): opt-level = 3 (Full Speed)│
│  • Your Code (src/):                          opt-level = 0 (1s Build)  │
│  • Linker (.cargo/config.toml):               LLD Linker (<0.5s Link)   │
└────────────────────────────────────────────────────────────────────────┘
```

### How to Run in Development Mode:

#### Terminal 1 — Rust Backend (with auto-reload on file change)
```bash
cargo watch -x run
# (Or simply 'cargo run' if not using cargo-watch)
```
- Starts the native ML engine and API server at `http://127.0.0.1:8123`.

#### Terminal 2 — SvelteKit Web UI (with instant Hot Module Replacement)
```bash
cd web
npm run dev
```
- Open [http://localhost:5173](http://localhost:5173) in your browser. Any edits in Svelte components will update in real time!

### Fast Commands for Developers:

#### 1. Instant Type-Checking (~0.48 seconds)
Run `cargo check` to validate types, borrow checker, and syntax instantly:
```bash
cargo check
```

#### 2. Incremental Dev Run (~1.1 seconds)
Run with dev profile (your code compiles in ~1s while ML models and image decoders execute at full release speed):
```bash
cargo run
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
