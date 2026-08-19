<div align="center">

<img src="assets/icon.png" width="96" height="96" alt="XianScan Cinnabar Seal" style="border-radius: 18px;" />

# XianScan

**Native Comic Translation Server for Chinese Manhua, Korean Manhwa, & Japanese Manga**

*Speech bubble detection, multi-language OCR, LLM translation, inpainting, and typesetting built with Rust & ONNX Runtime.*

<br/>

[![Portfolio](https://img.shields.io/badge/Portfolio-arbenger.com-111827?style=for-the-badge&logo=google-chrome&logoColor=white)](https://arbenger.com/contact/)
[![Email](https://img.shields.io/badge/Contact-arbenapura.official@gmail.com-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:arbenapura.official@gmail.com)
[![Support on Ko-Fi](https://img.shields.io/badge/Support_on-Ko--Fi-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white)](https://ko-fi.com/arbenapura)
[![Rust](https://img.shields.io/badge/Rust-1.80+-DEA584?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-1.19+-005CED?style=for-the-badge&logo=onnx&logoColor=white)](https://onnxruntime.ai/)
[![DirectML](https://img.shields.io/badge/Hardware-DirectML_•_CPU_SIMD-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://learn.microsoft.com/en-us/windows/ai/directml/)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2.x_•_Svelte_5-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

<br/>
<br/>

| 📖 1. Original Raw Source | 🎨 2. Neural Inpainted Canvas | ✍️ 3. Translated & Typeset Result |
| :---: | :---: | :---: |
| <img src="docs/showcase/manhua_raw.jpg" width="260" alt="Original Raw Scan"/> | <img src="docs/showcase/manhua_cleaned.jpg" width="260" alt="Neural Inpainted Page"/> | <img src="docs/showcase/manhua_translated.jpg" width="260" alt="Translated and Typeset Page"/> |

<sub><em>Disclaimer: Showcase artwork from 《妖神记》 (Tales of Demons and Gods) is used under Fair Use strictly for technical software demonstration and algorithmic benchmarking. All copyrights belong to the respective authors and publishers.</em></sub>

</div>

---

## 📖 Overview & Mission

**XianScan** is an open-source, local-first translation studio engineered to be **exceptionally portable, lightweight, and effortless to use**.

Our primary mission is to provide an **uninterrupted, automated reading flow** for comic readers, language learners, and translation teams:
- **Zero-Friction Setup**: Delivered as a single standalone executable. No Python environments, no CUDA configuration, and no complex terminal setups required.
- **Complete Reading Automation**: Eliminates manual busywork by automatically coordinating the entire pipeline—from 1-click browser importing to ML bubble detection, multi-language OCR, background cleaning, and context-aware typesetting.
- **Hardware Freedom**: Highly optimized multi-threaded SIMD inference (AVX2, AVX-512, ARM NEON) that runs at blistering speed on standard laptops and CPUs, while automatically utilizing DirectML GPU acceleration when a graphics card is available.

---

### 🔄 The Automated 5-Stage Pipeline

1. **Detection & Segmentation**: Detects speech bubbles, sound effects, and text boundaries using an RT-DETR model.
2. **Text Recognition (OCR)**: Extracts horizontal and vertical typography across 11 CJK and global languages.
3. **Contextual Translation**: Translates text using free local LLMs (Ollama, LM Studio) or cloud AI APIs with dynamic terminology glossary matching.
4. **Neural Inpainting**: Erases original text using LaMa neural inpainting to seamlessly restore background artwork.
5. **Typesetting Studio**: Renders translated dialogue with automatic font sizing, boundary fitting, stroke outlines, and dynamic CJK fallbacks.

---

## 📚 Comic Format Support

| Format | Specialized Pipeline Features |
| :--- | :--- |
| <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/cn.svg" width="18" alt="China" /> **Manhua (国漫)** | Vertical scroll strips, cultivation terminology glossaries, and multi-line narrative blocks. |
| <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/kr.svg" width="18" alt="Korea" /> **Manhwa & Webtoons (웹툰)** | Long-strip gutter splitting (`/pages/reslice`), vertical page stitching, and Korean OCR dictionary support. |
| <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/jp.svg" width="18" alt="Japan" /> **Manga (漫画)** | Right-to-left panel flow, vertical text line OCR, Furigana handling, and multi-column bubble detection. |
| 🌐 **Global & Western Comics** | Horizontal text flow, uppercase comic typography, and dynamic paragraph line wrapping. |

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

- **East Asian**: <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/cn.svg" width="18" alt="China" /> Chinese (Simplified & Traditional), <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/jp.svg" width="18" alt="Japan" /> Japanese, <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/kr.svg" width="18" alt="Korea" /> Korean
- **Southeast Asian**: <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/vn.svg" width="18" alt="Vietnam" /> Vietnamese, <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/th.svg" width="18" alt="Thailand" /> Thai, <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/id.svg" width="18" alt="Indonesia" /> Indonesian
- **European & Global**: <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/gb.svg" width="18" alt="UK" /> English, <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/es.svg" width="18" alt="Spain" /> Spanish, <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/fr.svg" width="18" alt="France" /> French, <img src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/ru.svg" width="18" alt="Russia" /> Russian

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

Translate using lightweight local models or high-throughput cloud APIs:

- **100% Free & Unlimited Local AI** (<img src="assets/icons/ollama.svg" width="16" height="16" alt="Ollama" /> **Ollama** / **LM Studio**):
  - <img src="assets/icons/qwen.svg" width="16" height="16" alt="Qwen" /> **Qwen 2.5 (3B / 7B / 14B)**: The leading lightweight model for CJK (Chinese, Japanese, Korean) translation, cultural idiom accuracy, and comic dialogue understanding.
  - <img src="assets/icons/llama.svg" width="16" height="16" alt="Meta Llama" /> **Llama 3.2 (1B / 3B)**: Ultra-fast and lightweight inference engineered for low-latency execution on minimal hardware (~2–4 GB RAM).
  - <img src="assets/icons/gemma.svg" width="16" height="16" alt="Google Gemma" /> **Gemma 2 (2B / 9B)** & <img src="assets/icons/mistral.svg" width="16" height="16" alt="Mistral AI" /> **Mistral (7B)**: Clean reasoning and high-fidelity dialogue translation.
- **Cloud AI APIs**: Compatible with standard OpenAI-compatible endpoints, <img src="assets/icons/gemini.svg" width="16" height="16" alt="Google Gemini" /> **Google AI Studio (Gemini)**, <img src="assets/icons/groq.svg" width="16" height="16" alt="Groq" /> **Groq** (instant ultra-fast inference), <img src="assets/icons/openrouter.svg" width="16" height="16" alt="OpenRouter" /> **OpenRouter**, and <img src="assets/icons/openai.svg" width="16" height="16" alt="OpenAI" /> **OpenAI**.
- **Series Glossaries**: Dynamic multi-pattern terminology matching (via Aho-Corasick) to maintain consistent character names, cultivation realms, and skill terms across chapters.

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

## 🧩 Browser Web Extension (Chrome, Firefox, Edge, Brave)

XianScan includes a high-performance **Web Importer Extension** (`extensions/xianscan-importer/`) to import comic chapters directly from web readers into your self-hosted server with one click:

- **⚡ Fast Scan**: Auto-scrolls progressive webtoon strips to trigger lazy-loads and extract all pages in under 1.5 seconds.
- **🛡️ 4-Tier Smart Noise Filter**: Automatically detects reader containers and drops advertisements, social widgets, blurhash placeholders, and sidebar thumbnails.
- **📦 Dual Browser Releases**: Pre-packaged Universal (`.zip` for Chrome/Edge/Brave) and Firefox Add-on (`.xpi`) in `extensions/xianscan-importer/store/`.
- **🚀 One-Click Auto-Translate**: Automatically queues the newly imported chapter for neural detection, OCR, and AI translation upon upload completion.

To install:
- **Chrome / Edge / Brave**: Load unpacked from `extensions/xianscan-importer/dist/` in `chrome://extensions/`
- **Firefox**: Load temporary add-on from `extensions/xianscan-importer/dist-firefox/manifest.json` (or `.xpi`) in `about:debugging#/runtime/this-firefox`

---

## 🗺️ In Progress & Future Roadmap

- **🔄 Enhanced Japanese Manga Recognition**: Continuously optimizing vertical Japanese OCR text extraction, Furigana filtering, multi-column right-to-left reading order clustering, and complex speech bubble grouping.
- **👥 Contextual Gender & Pronoun Consistency**: Developing intelligent coreference resolution algorithms to accurately track character dialogue and resolve omitted or ambiguous CJK pronouns (Chinese 他/她, Japanese 彼/彼女, Korean 그/그녀/honorifics) across multi-panel conversation flows, extending beyond static glossaries to fit the distinct narrative structures of Manhua, Manga, and Manhwa.
- **🍎 Expanded macOS Support & Native Bundling**: We provide pre-compiled Apple Silicon builds ([`xianscan-macos-arm64.tar.gz`](https://github.com/ArbenApura/xianscan-rust/releases/download/v0.1.5/xianscan-macos-arm64.tar.gz)). As I currently do not have a dedicated macOS setup for local testing, community feedback and issue reports on macOS are warmly appreciated as we refine native `.app` and DMG distribution.
- **📖 Xianslate Integration (All-in-One Translation Suite)**: Integrating [Xianslate](https://github.com/ArbenApura/xianslate) — our specialized Light Novel & Web Novel translation tool — into XianScan to create a unified reader and translation suite for both comics (Manga/Manhua/Manhwa) and light novels with shared dynamic terminology glossaries.

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

## 👨‍💻 Author & Opportunities

**XianScan** is architected and built by **[Arben Apura](https://arbenger.com/contact/)** as a showcase of end-to-end full-stack web engineering, intuitive UI/UX design, and intelligent application architecture.

### 💼 Open for Roles & Contract Work
If you are looking for a **Full-Stack Web Developer** with expertise in modern web technologies (**TypeScript, SvelteKit, Node.js, React**), browser extensions, and applied AI workflows:
- 🎯 **Available for**: Full-time Software Engineering / Full-Stack Developer roles, high-impact contract projects, and web development consulting.
- 🌐 **Portfolio & Inquiries**: [arbenger.com/contact](https://arbenger.com/contact/)
- ✉️ **Direct Email**: [arbenapura.official@gmail.com](mailto:arbenapura.official@gmail.com)
- 🐙 **GitHub Profile**: [@ArbenApura](https://github.com/ArbenApura)

### ☕ Fuel Open-Source Development
If XianScan enhances your reading flow, language learning, or translation workflow, supporting this project helps fund ongoing independent R&D, model optimization, and future open-source tools:

<div align="center">

[![Support on Ko-Fi](https://img.shields.io/badge/Support_on-Ko--Fi-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white)](https://ko-fi.com/arbenapura)

</div>

---

## ⚖️ Ethical Use & Copyright Notice

**XianScan** is designed strictly as a **local-first personal assistive translation and language-learning tool**.

- **Respect for Original Creators**: We deeply respect the artistry, effort, and intellectual property of original manga artists, manhua authors, manhwa creators, and publishers.
- **Support Official Releases**: Users are strongly encouraged to purchase official translated releases and support creators directly on licensed digital platforms (such as *Kuaikan Manhua, Bilibili Manga, Naver WEBTOON, KakaoPage, Tapas, Tappytoon, Lezhin, MANGA Plus by Shueisha, VIZ Media, and BookWalker*).
- **100% Local & Private**: XianScan does not host, re-distribute, or scrape copyrighted works on public servers. All image processing, OCR, inpainting, and translation execution occur entirely on the user's private local hardware.
- **Fair Use & Personal Study**: This software is intended for personal language learning, accessibility, and translation workflow assistance under applicable Fair Use guidelines.

---

## 📜 License & Acknowledgments

Licensed under the **[MIT License](LICENSE)** © 2026 Arben Apura.

- **RT-DETR Comic Detector**: Speech bubble and text segmentation models by [ogkalu/comic-text-and-bubble-detector](https://huggingface.co/ogkalu/comic-text-and-bubble-detector) (MIT / Apache-2.0) and detection architectures from [manga-image-translator](https://github.com/zyddnys/manga-image-translator) (GPL-3.0 / Apache-2.0).
- **PaddleOCR & RapidOCR**: Multilingual OCR models (PP-OCRv6, Korean, Cyrillic, Thai) and direction classifier by [PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [RapidAI/RapidOCR](https://github.com/RapidAI/RapidOCR), and [xberg-io/paddleocr-onnx-models](https://huggingface.co/xberg-io/paddleocr-onnx-models) (Apache-2.0).
- **LaMa Inpainting**: Large Mask Inpainting architecture by [advimman/lama](https://github.com/advimman/lama) (Apache-2.0) and manga inpainting weights by [ogkalu/lama-manga-onnx-dynamic](https://huggingface.co/ogkalu/lama-manga-onnx-dynamic).
- **Typography & Fonts**: Open-source dialogue and CJK fonts (Friendly Sans, LXGW WenKai) under the SIL Open Font License ([OFL-1.1](https://openfontlicense.org/)). CC Wild Words is a registered trademark of Comicraft.
- **ONNX Runtime**: High-performance inference engine by [Microsoft](https://github.com/microsoft/onnxruntime) (MIT License).
- **Artwork & Trademarks**: All demonstration images are referenced under Fair Use for open-source technical illustration and model benchmarking. All rights and copyrights remain with their respective intellectual property owners.