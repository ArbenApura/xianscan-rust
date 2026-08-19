<div align="center">

# 🏮 XianScan-Rust (仙Scan)

**Native Comic Translation Server for Chinese Manhua, Korean Manhwa, & Japanese Manga**

*Speech bubble detection, multi-language OCR, LLM translation, inpainting, and typesetting built with Rust & ONNX Runtime.*

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

**XianScan-Rust** is a native translation tool designed to be as **portable and easy-to-use as possible** for **Chinese Manhua (国漫)**, **Korean Manhwa (웹툰/만화)**, **Japanese Manga (漫画)**, and **Western Comics**.

It provides an end-to-end comic translation workflow:
1. **Detection & Segmentation**: Detects speech bubbles, text boxes, and on-page sound effects.
2. **Text Recognition (OCR)**: Extracts text with OCR models supporting horizontal and vertical reading orders.
3. **Translation**: Translates text using customizable LLM providers with glossary support.
4. **Artwork Cleaning**: Inpaints text regions using LaMa neural inpainting.
5. **Typesetting**: Renders translated text into bubbles with automatic font sizing, line balancing, and font fallback.

---

## 📚 Comic Format Support

| Format | Features |
| :--- | :--- |
| **🇨🇳 Chinese Manhua** | Vertical scroll strips, cultivation terminology glossaries, and multi-line narrative blocks. |
| **🇰🇷 Korean Manhwa & Webtoons** | Long-strip gutter splitting (`/pages/reslice`), vertical page stitching, and Korean OCR dictionary support. |
| **🇯🇵 Japanese Manga** | Right-to-left panel flow, vertical text line OCR, Furigana handling, and multi-column bubble detection. |
| **🌐 Western & Global Comics** | Horizontal text flow, uppercase comic typography, and paragraph line wrapping. |

---

## ⚙️ Features

- **Portable Single Executable**: Designed to be as portable and easy to use as possible — download, run, and start translating immediately with embedded models and web interface.
- **Hardware Acceleration**: Runs on CPU (with SIMD optimizations) or GPU via DirectML (Windows/DirectX-compatible GPUs).
- **Bubble Detection**: Uses an RT-DETR model to locate speech bubbles, text regions, and sound effects.
- **Background Inpainting**: Uses LaMa ONNX to erase original text and restore background art.
- **Comic Typesetting**: Automatic text fitting, line wrapping, outlines, and comic font support (CC Wild Words).
- **Webtoon Tools**: Functions for stitching pages into long vertical rolls and slicing strips along panel gutters.
- **Cross-Device Web UI (LAN Access)**: Once the server is running on your PC, you can access the full Web UI from any device connected to the same local Wi-Fi / network (such as your smartphone, tablet, or laptop).

---

## 🌐 Supported OCR Languages

Native OCR models and dictionaries are included for **11 languages**:

- **East Asian**: Chinese (Simplified), Chinese (Traditional), Japanese, Korean
- **Southeast Asian**: Vietnamese, Thai, Indonesian
- **European & Cyrillic**: English, Spanish, French, Russian

---

## 🤖 Supported Translation Providers

Translate using either free local models or cloud APIs:

- **100% Free & Unlimited Local AI**: Run open-weight models locally with **Ollama** or **LM Studio** (e.g. Qwen 2.5, Llama 3.3, DeepSeek-R1 distills) for completely free translations with zero API fees and total privacy.
- **Cloud AI APIs**: DeepSeek (V3, R1, V4), Google AI Studio (Gemini), Groq, OpenRouter, and OpenAI.
- **Series Glossaries**: Terminology matching (via Aho-Corasick) to maintain consistent character names, cultivation realms, and skill terms across chapters.

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

- Open **[http://localhost:8124](http://localhost:8124)** in your web browser.
- **Mobile & LAN Access**: Access XianScan from your phone or tablet on the same Wi-Fi by opening `http://<your-computer-ip>:8124`.

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