<div align="center">

# 🏮 XianScan-Rust (仙Scan)

**Native High-Performance Comic, Manga & Manhua Translation Server**

*Automated Speech Bubble Detection, Multi-Language OCR, Multi-Provider LLM Translation, AI Inpainting, and Studio Typesetting — Powered by Rust & ONNX Runtime.*

<br/>

[![Ko-Fi](https://img.shields.io/badge/Support_on-Ko--Fi-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white)](https://ko-fi.com/arbenapura)
[![Rust](https://img.shields.io/badge/Rust-1.80+-DEA584?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-1.19+-005CED?style=for-the-badge&logo=onnx&logoColor=white)](https://onnxruntime.ai/)
[![DirectML](https://img.shields.io/badge/Hardware-DirectML_•_CPU_SIMD-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://learn.microsoft.com/en-us/windows/ai/directml/)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2.x_•_Svelte_5-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

</div>

---

## 📖 Overview

**XianScan-Rust** is a unified, native translation platform built for webtoons, manhua, and manga. It automatically detects speech bubbles, extracts multi-language text, synthesizes clean background art with neural inpainting, translates dialogue using modern LLMs with dynamic glossaries, and renders studio-grade comic typography.

Built from the ground up in native Rust with ONNX Runtime, XianScan eliminates Python runtime overhead to provide **sub-30ms startup**, a **~45MB idle memory footprint**, and a **self-contained zero-dependency executable**.

---

## ✨ Key Highlights

- **⚡ Zero-Dependency Single Binary**: No Python, PyTorch, CUDA toolkit, or Node.js required on the host system.
- **🚀 Universal Hardware Acceleration**: Instant out-of-the-box performance on any CPU SIMD, with automatic DirectML GPU acceleration for NVIDIA, AMD, Intel, and Apple Silicon.
- **🎯 Precision Speech Bubble Extraction**: Deep learning bubble segmentation (RT-DETR) with polygon mask expansion to capture delicate punctuation and trailing ellipsis (`……`).
- **🎨 AI Background Inpainting**: Neural text erasure powered by Big-LaMa ONNX with seamless texture blending.
- **✍️ Studio-Grade Typesetting**: Automatic font-fitting, line balancing, and dialogue formatting using industry-standard comic typefaces (CC Wild Words).
- **🌐 Headless LAN & Remote Server**: Accessible directly from browsers on phones, tablets, or remote networks.

---

## 🌐 Supported Languages

XianScan provides native detection and OCR routing across **10 languages**:

- **East Asian**: Chinese (Simplified), Chinese (Traditional), Japanese, Korean
- **Southeast Asian**: Thai, Indonesian
- **European / Cyrillic**: English, Spanish, French, Russian

---

## 🤖 Supported Translation Providers

Connect your favorite cloud API or run 100% locally:

- **Cloud AI**: DeepSeek (V3, R1, V4), Google AI Studio (Gemini 3.7 / 3.5 Flash), Groq (Llama 3.3 70B, Qwen 2.5 32B), OpenRouter (Claude 3.5 Sonnet, etc.), OpenAI (GPT-4o, GPT-4o-mini).
- **Local & Self-Hosted**: Ollama, LM Studio, and any custom OpenAI-compatible endpoint (`vLLM`, `LocalAI`, `Aphrodite`).
- **Dynamic Glossaries**: Automatic Aho-Corasick terminology injection guarantees consistent character names, cultivation ranks, and faction terms across chapters.

---

## 🚀 Quick Start

### 1. Standalone Executable (Recommended)

Download the latest pre-compiled release from [Releases](https://github.com/ArbenApura/xianscan-rust/releases) and run:

```powershell
# Windows
.\xianscan-rust.exe

# Linux / macOS
chmod +x xianscan-rust && ./xianscan-rust
```

Open **[http://localhost:8124](http://localhost:8124)** in your web browser.

---

### 2. Building from Source

#### Prerequisites
- **Rust 1.80+** (`rustup install stable`)
- **Node.js 18+** & **Yarn**

#### Standalone 1-File Release Build
```bash
# 1. Build SvelteKit frontend
cd web && yarn install && yarn build && cd ..

# 2. Compile standalone binary with embedded models & web UI
cargo build --release --features embed-models,embed-web
```
The compiled binary will be located at `target/release/xianscan-rust` (`.exe` on Windows).

#### Fast Iteration Dev Mode
```bash
# Runs the Rust ML engine (:8123) and Vite Live HMR (:8124) in one command:
cargo run -- --dev
```

---

## 🔌 REST API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | `GET` | Health check, active hardware backend, and loaded models. |
| `/system/hardware` | `GET` | Hardware acceleration info and GPU adapters. |
| `/system/device` | `POST` | Dynamically switch execution provider (`directml`, `cpu`, `auto`). |
| `/pages/analyze` | `POST` | Speech bubble detection, polygon segmentation, and multi-language OCR. |
| `/pages/clean` | `POST` | Neural inpainting to clean text from selected regions. |
| `/pages/preprocess` | `POST` | Image normalization and preparation. |
| `/pages/stitch` | `POST` | Vertically stitch multi-page chapters into continuous strips. |
| `/pages/reslice` | `POST` | Split long-strip webtoons along panel gutters. |

---

## 🧪 Testing

```bash
# Run all unit and integration tests
cargo test -- --nocapture

# Run the 10-language ML regression test suite
cargo test --test regression -- --nocapture

# Run frontend tests
cd web && yarn test
```

---

## 💖 Support & Sponsorship

If XianScan is useful to you or your translation workflow, consider supporting ongoing development:

<div align="center">

[![Support on Ko-Fi](https://img.shields.io/badge/Support_on-Ko--Fi-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white)](https://ko-fi.com/arbenapura)

</div>

---

## 📜 License & Acknowledgments

Licensed under the **[MIT License](LICENSE)** © 2026 Arben Apura.

- **RT-DETR & ComicTextDetector**: Bubble segmentation adapted from [manga-image-translator](https://github.com/zyddnys/manga-image-translator).
- **RapidOCR**: PP-OCR models and decoders by [RapidAI](https://github.com/RapidAI/RapidOCR).
- **LaMa Inpainting**: Large Mask Inpainting by [advimman/lama](https://github.com/advimman/lama).
- **Typography**: CC Wild Words comic typeface under the Open Font License (OFL-1.1).