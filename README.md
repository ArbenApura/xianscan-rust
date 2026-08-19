<div align="center">

# 🏮 XianScan-Rust (仙Scan)

**Native High-Performance Translation Suite for Chinese Manhua, Korean Manhwa, & Japanese Manga**

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

**XianScan-Rust** is an all-in-one native translation and scanlation suite engineered specifically for **Chinese Manhua (国漫)**, **Korean Manhwa (웹툰/만화)**, **Japanese Manga (漫画)**, and **Western Comics**.

It brings the entire scanlation pipeline into a single, cohesive workflow:
1. **Detects & Segments**: Automatically identifies speech bubbles, text boxes, and free-floating SFX (Sound Effects).
2. **Recognizes Text**: Accurately extracts text with dedicated language-tuned OCR engines across vertical and horizontal reading directions.
3. **Translates with Context**: Translates dialogue using cutting-edge LLMs guided by dynamic glossaries (cultivation realms, honorifics, character names).
4. **Cleans Artwork**: Seamlessly inpaints background artwork using deep neural networks to produce spotless raw pages.
5. **Typesets Automatically**: Fits, balances, and renders dialogue with industry-standard comic typography and per-glyph font fallback.

Built with native Rust and ONNX Runtime, XianScan delivers **instant startup (<30ms)**, a **lean ~45MB idle memory footprint**, and a **fully self-contained, zero-dependency executable**.

---

## ✨ Features Tailored for Comic Media

| Media Type | Specialized Capabilities |
| :--- | :--- |
| **🇨🇳 Chinese Manhua** | Tuned for colorful vertical strips, dense cultivation terminology, watermark suppression, and multi-line narrative blocks. |
| **🇰🇷 Korean Manhwa & Webtoons** | Smart panel gutter slicing (`/pages/reslice`), continuous vertical stitch mode, and dedicated Korean OCR dictionary routing. |
| **🇯🇵 Japanese Manga** | Right-to-left reading order detection, vertical text line recognition, Furigana handling, and complex panel layout analysis. |
| **🌐 Western & Global Comics** | Full Latin script typesetting, uppercase balloon typography, hyphenation, and multi-line paragraph balancing. |

---

## 🚀 Key Highlights

- **⚡ Self-Contained Single Binary**: Download and double-click to launch — all AI models, Web UI, and engines are bundled directly inside.
- **🚀 Universal Hardware Acceleration**: Instant acceleration out of the box using CPU SIMD (AVX2/AVX-512/NEON) and automatic DirectML GPU acceleration across NVIDIA, AMD, Intel, and Apple Silicon.
- **🎯 RT-DETR Speech Bubble Detection**: Deep learning object detector identifies speech bubble containers, enclosed text lines, and free-floating text/SFX with polygon precision.
- **🎨 Neural Background Inpainting**: High-fidelity text erasure powered by Big-LaMa ONNX with seamless texture and gradient reconstruction.
- **✍️ Studio-Grade Comic Typography**: Automatic font size scaling, dialogue line balancing, text stroke outlines, and CC Wild Words comic typeface support.
- **📜 Smart Webtoon Stitching & Slicing**: Automatically stitches split images into continuous webtoon rolls or slices long continuous pages along natural panel gutters.
- **🌐 Accessible LAN & Remote Server**: Embedded web interface accessible from desktop browsers, mobile phones, or local network tablets.

---

## 🌐 Supported Source & Target Languages

XianScan provides native detection, dictionary routing, and OCR models across **11 languages**:

- **East Asian**: Chinese (Simplified), Chinese (Traditional), Japanese, Korean
- **Southeast Asian**: Vietnamese, Thai, Indonesian
- **European & Cyrillic**: English, Spanish, French, Russian

---

## 🤖 Supported Translation Providers

Connect your preferred AI provider or run completely offline:

- **Cloud AI**: DeepSeek (V3, R1, V4), Google AI Studio (Gemini 2.5 / 2.0 Flash), Groq (Llama 3.3 70B, Qwen 2.5 32B), OpenRouter (Claude 3.5 Sonnet, etc.), OpenAI (GPT-4o, GPT-4o-mini).
- **Local & Self-Hosted**: Ollama, LM Studio, vLLM, LocalAI, Aphrodite, and any OpenAI-compatible endpoint.
- **Dynamic Series Glossaries**: Automatic Aho-Corasick terminology injection ensures 100% consistency for character names, martial arts skills, cultivation ranks, and faction names across chapters.

---

## 🏁 Quick Start

### 1. Standalone Executable (Recommended)

Download the pre-compiled standalone binary for your operating system from [Releases](https://github.com/ArbenApura/xianscan-rust/releases) and launch:

```powershell
# Windows
.\xianscan.exe

# Linux / macOS
chmod +x xianscan && ./xianscan
```

Open **[http://localhost:8124](http://localhost:8124)** in your web browser.

---

### 2. Building from Source

#### Prerequisites
- **Rust 1.80+** (`rustup install stable`)
- **Node.js 18+** & **Yarn**

#### Standalone Release Build
```bash
# 1. Build SvelteKit frontend
cd web && yarn install && yarn build && cd ..

# 2. Compile standalone binary with embedded models & web UI
cargo build --release --features embed-models,embed-web
```
The compiled binary will be located at `target/release/xianscan-rust` (`.exe` on Windows).

#### Fast Iteration Dev Mode
```bash
# Runs the Rust ML engine (:8123) and Vite Live HMR (:8124) concurrently:
cargo run -- --dev
```

---

## 🔌 REST API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | `GET` | Health status, active hardware backend, and loaded model diagnostics. |
| `/system/hardware` | `GET` | GPU adapter enumeration and hardware capabilities. |
| `/system/device` | `POST` | Dynamically switch execution provider (`directml`, `cpu`, `auto`). |
| `/pages/analyze` | `POST` | Speech bubble detection, polygon segmentation, and multi-language OCR. |
| `/pages/clean` | `POST` | Neural inpainting to erase text from selected bubble masks. |
| `/pages/preprocess` | `POST` | Image normalization and contrast optimization. |
| `/pages/stitch` | `POST` | Vertically stitch individual pages into seamless webtoon strips. |
| `/pages/reslice` | `POST` | Split tall webtoon strips into pages along panel gutters. |

---

## 🧪 Testing

```bash
# Run all unit and integration tests
cargo test -- --nocapture

# Run the 11-language ML regression test suite
cargo test --test regression -- --nocapture

# Run Web UI frontend tests
cd web && yarn test
```

---

## 💖 Support & Sponsorship

If XianScan is useful to your translation workflow, scanlation group, or reading experience, consider supporting ongoing development:

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