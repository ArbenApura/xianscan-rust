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

<br/>
<br/>

| 🇨🇳 1. Original Raw | 🎨 2. Neural Inpainted | ✍️ 3. Translated & Typeset |
| :---: | :---: | :---: |
| <img src="docs/showcase/manhua_raw.jpg" width="260" alt="Original Raw Scan"/> | <img src="docs/showcase/manhua_cleaned.jpg" width="260" alt="Neural Inpainted Page"/> | <img src="docs/showcase/manhua_translated.jpg" width="260" alt="Translated and Typeset Page"/> |

<sub><em>Disclaimer: Showcase artwork from 《妖神记》 (Tales of Demons and Gods) is used under Fair Use strictly for technical software demonstration and algorithmic benchmarking. All copyrights belong to the respective authors and publishers.</em></sub>

</div>

---

## 📖 Overview

**XianScan-Rust** is a native translation tool designed to be as **portable and easy to use as possible** for **Chinese Manhua (国漫)**, **Korean Manhwa (웹툰/만화)**, **Japanese Manga (漫画)**, and **Western Comics**.

It runs on standard multi-core CPUs out of the box—no dedicated GPU is required—while automatically utilizing DirectML GPU acceleration when available on Windows.

The workflow integrates the entire comic translation pipeline into a single application:
1. **Detection & Segmentation**: Detects speech bubbles, text regions, and on-page sound effects using an RT-DETR model.
2. **Text Recognition (OCR)**: Extracts text with OCR models supporting horizontal and vertical reading directions.
3. **Translation**: Translates text using free local LLMs (Ollama, LM Studio) or cloud AI APIs with dynamic glossary matching.
4. **Artwork Cleaning**: Inpaints text regions using LaMa neural inpainting to restore clean background artwork.
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

- **Runs on Any CPU (No GPU Required)**: Multi-threaded CPU inference with SIMD acceleration (AVX2, AVX-512, ARM NEON). Runs on standard laptops, desktop PCs, and Apple Silicon, while automatically utilizing DirectML GPU acceleration when a dedicated GPU is available.
- **Portable Single Executable**: Download, run, and start translating immediately with embedded models and the web interface bundled inside.
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

## 🎨 Neural Inpainting Strategies

XianScan provides 3 configurable inpainting modes in the Web UI to balance throughput and background reconstruction quality:

| Inpainting Mode | Speed | Quality | Description |
| :--- | :--- | :--- | :--- |
| **⚡ Patch Crop** *(Default)* | **Fastest** | **1:1 Native** | Crops and inpaints each speech bubble individually at full 1:1 native resolution. Keeps the rest of the page untouched with fast processing speed. |
| **✨ Full Dynamic** | **Standard** | **Highest** | Inpaints the entire uncut image canvas in a single pass. Delivers the most seamless global artwork gradients and texture reconstruction (recommended for maximum quality). |
| **⚖️ Balanced (512×512)** | **Fast** | **Standard** | Downsamples patches to 512×512 before inpainting and upscales back. Highly memory-efficient for low-resource hardware. |

---

## ✍️ Typesetting & Studio Controls

The embedded Web UI includes comprehensive controls to customize typography and translation workflows:

- **Typography & CJK Fallbacks**: Primary dialogue fonts (such as `CC Wild Words`, `General Sans`, `Poppins`, `Lexend`) paired with an automatic CJK fallback engine (`Friendly Sans`, `Yu Gothic`, `Microsoft YaHei`, `Malgun Gothic`).
- **Live Interactive Preview**: Test and preview typography in real time with dark/light scene background contrast, simulated tilt angles, and multi-language presets.
- **Bubble Fitting & Outlines**: Customize bubble edge padding (2% to 12%), font scaling multipliers (80% to 130%), text stroke outlines (None, Thin, Standard, Heavy), and luminance-sensing contrast.
- **Orientation & Letterform Casing**: Toggle automatic tilt rotation along detected diagonal comic bubbles ($\pm 2^\circ$ to $\pm 45^\circ$) and select dialogue letterform casing (`UPPERCASE`, `Normal / As Is`, `lowercase`).
- **Webtoon Gutter Reslicing**: Automatically recombine and split tall vertical webtoon strips along panel gutters before batch translation to prevent speech bubbles from being bisected across slice seams.
- **Parallel Processing**: Configure concurrent page worker threads (1–4) and batch chapter queues directly from the settings panel.

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

## 🗺️ In Progress & Future Roadmap

- **🔄 Enhanced Japanese Manga Recognition**: Continuously optimizing vertical Japanese OCR text extraction, Furigana filtering, multi-column right-to-left reading order clustering, and complex speech bubble grouping.
- **🌐 Browser Web Extension**: Developing a browser extension (Chrome / Firefox) to import comic pages and webtoon strips directly from web sources into XianScan with one click.
- **📖 Xianslate Integration (All-in-One Translation Suite)**: Integrating [Xianslate](https://github.com/ArbenApura/xianslate) — our specialized Light Novel & Web Novel translation tool — into XianScan to create a unified reader and translation suite for both comics (Manga/Manhua/Manhwa) and light novels with shared dynamic terminology glossaries.
- **📦 Direct Archive Export**: Export translated chapters directly to `.cbz` (Comic Book Zip) and `.epub` formats with optimized compression.

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

- **RT-DETR Comic Detector**: Speech bubble and text segmentation models by [ogkalu/comic-text-and-bubble-detector](https://huggingface.co/ogkalu/comic-text-and-bubble-detector) and [manga-image-translator](https://github.com/zyddnys/manga-image-translator) (MIT / Apache-2.0).
- **PaddleOCR & RapidOCR**: Multilingual OCR models (PP-OCRv6, Korean, Cyrillic, Thai) and direction classifier by [PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [RapidAI/RapidOCR](https://github.com/RapidAI/RapidOCR), and [xberg-io/paddleocr-onnx-models](https://huggingface.co/xberg-io/paddleocr-onnx-models) (Apache-2.0).
- **LaMa Inpainting**: Large Mask Inpainting architecture by [advimman/lama](https://github.com/advimman/lama) (Apache-2.0) and manga inpainting weights by [ogkalu/lama-manga-onnx-dynamic](https://huggingface.co/ogkalu/lama-manga-onnx-dynamic).
- **Typography & Fonts**: CC Wild Words comic typeface under the SIL Open Font License ([OFL-1.1](https://openfontlicense.org/)).
- **ONNX Runtime**: High-performance inference engine by [Microsoft](https://github.com/microsoft/onnxruntime) (MIT License).
- **Artwork & Trademarks**: All demonstration images are referenced under Fair Use for open-source technical illustration and model benchmarking. All rights and copyrights remain with their respective intellectual property owners.