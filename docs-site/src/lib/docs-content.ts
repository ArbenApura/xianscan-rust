// ==============================================================================
// XIANSCAN DOCUMENTATION CONTENT REGISTRY
// Central repository of verified, production-grade technical documentation.
// Every code snippet, CLI flag, API route, and model parameter is strictly verified
// against the Rust engine (crates/xianscan), Web Studio (web/), and Extensions.
// Invariant: Zero em dashes across all documentation.
// ==============================================================================

export interface DocChapterContent {
	title: string;
	description: string;
	lastUpdated: string;
	sections: Array<{
		id: string;
		title: string;
		content: string;
	}>;
}

export const DOCS_CONTENT: Record<string, DocChapterContent> = {
	'getting-started/quick-start': {
		title: 'Quick Start (3-Minute Setup)',
		description: 'Install and launch XianScan standalone server to translate your first raw comic chapter in under 3 minutes.',
		lastUpdated: '2026-09-02',
		sections: [
			{
				id: 'download-binary',
				title: '1. Download the Standalone Binary',
				content: `
XianScan ships as a single, self-contained executable with the SvelteKit web interface, ONNX neural inference engine, and SQLite database embedded directly inside.

| Platform | Release Archive | Acceleration Support |
| :--- | :--- | :--- |
| **Windows 10 / 11** (x86_64) | \`xianscan-windows-x86_64.zip\` (contains \`xianscan.exe\`) | DirectML (NVIDIA, AMD, Intel) & CPU |
| **Linux** (x86_64 / glibc 2.31+) | \`xianscan-linux-x86_64.tar.gz\` (contains \`xianscan\`) | CUDA 12 & CPU |
| **macOS** (Apple Silicon M1-M4) | \`xianscan-macos-arm64.tar.gz\` (contains \`xianscan\`) | Apple Neural Engine (CoreML / Metal) & CPU |

Download the latest release archive from the [GitHub Releases](https://github.com/ArbenApura/xianscan-rust/releases) page.
`,
			},
			{
				id: 'launch-server',
				title: '2. Launch the Server',
				content: `
#### Windows:
Extract the ZIP archive and **double-click \`xianscan.exe\`** in File Explorer (a dedicated console window will open automatically) or run \`.\\xianscan.exe\` inside PowerShell / Command Prompt.

#### Linux / macOS:
Extract the archive, make the binary executable, and run it in your terminal:

\`\`\`bash
chmod +x xianscan
./xianscan
\`\`\`

Upon launch, XianScan logs its startup sequence directly in the terminal / console (initializing hardware acceleration, loading AI model weights, extracting embedded assets, and starting the local server):

![XianScan Terminal Startup Console](/showcase/terminal_launch.png)
`,
			},
			{
				id: 'translate-first-chapter',
				title: '3. Translate Your First Chapter',
				content: `
1. Open **[http://localhost:8124](http://localhost:8124)** in your web browser.
2. In the Library, click **New Book** and set your series title, source language (e.g. Chinese, Korean, Japanese), and target language (e.g. English).
3. Inside your book, create a chapter or drag-and-drop a raw comic folder / image files (JPG, PNG, WebP) directly onto the dropzone.
4. Click **Translate All** on the top toolbar to queue translation tasks. Monitor your background jobs in real-time using the interactive **Queue Modal** HUD (which can be freely moved around the screen, minimized, or expanded to inspect all active and pending translations). Once the entire chapter finishes processing, clean inpainting and context-aware typeset outputs are displayed automatically.
5. Switch to **Webtoon Reader View** to enjoy continuous reading with automated typesetting, or sync with **[Mihon](/docs/extensions/mihon)** and other Tachiyomi-compatible apps for a native Android mobile reading experience!
`,
			},
		],
	},

	'getting-started/reading': {
		title: 'How to Import & Read',
		description: 'Explore the Webtoon reader, Side-by-Side comparison, Page Grid manager, Page Inspector, and Smart Re-slicing.',
		lastUpdated: '2026-09-02',
		sections: [
			{
				id: 'chapter-view-modes',
				title: '1. Three Dedicated Chapter View Modes',
				content: `
Inside any chapter, XianScan provides 3 switchable view modes located on the top toolbar:

- **Webtoon Continuous Reader**: Infinite vertical scrolling with black background, optimized for continuous manhwa and webtoon strips. Includes a reading width selector (**Compact** \`max-w-lg\`, **Standard** \`max-w-2xl\`, **Expanded** \`max-w-4xl\`) and a 1-click toggle between **Translated Output** and **Original Raw**.
- **Page Grid View**: Visual thumbnail grid of all pages in the chapter. Displays live pipeline status badges (\`Pending\`, \`Queued\`, \`Processing\`, \`Translated\`, \`Error\`), current pipeline step, and allows drag-and-drop page reordering.
- **Side-by-Side Compare View**: Synchronized two-column layout placing the raw source page on the left and the translated canvas on the right for panel-by-panel verification.
`,
			},
			{
				id: 'page-inspector',
				title: '2. Page Inspector Modal',
				content: `
Click on any page in Grid or Compare mode to open the **Page Inspector Modal**:

- **3-Layer Switching**: Switch instantly between **Output** (Translated & Typeset), **Cleaned** (LaMa Neural Inpainting), and **Original** (Raw scan).
- **OCR & Region Bounding Boxes**: Inspect detected speech bubble polygons, OCR confidence scores, extracted source dialogue, and target translations.
- **Single-Page Re-run**: Re-run the translation or inpainting pipeline on an individual page without re-processing the entire chapter.
`,
			},
			{
				id: 'smart-reslicing',
				title: '3. Smart Webtoon Re-slicing',
				content: `
Webtoons often suffer from arbitrary image splitting that cuts speech bubbles in half across slice boundaries. 

Click **Smart Re-slice** in the chapter menu to:
1. Recombine vertical strip fragments into a continuous image canvas.
2. Detect non-text whitespace valleys and natural panel gutters.
3. Automatically re-slice the chapter along clean panel boundaries before running speech bubble detection and OCR.
`,
			},
			{
				id: 'chapter-navigation',
				title: '4. Chapter Navigation & Ingestion',
				content: `
- **Folder & Image Ingestion**: Drag-and-drop any folder of comic images directly onto the chapter canvas to import pages with automatic sequence numbering.
- **Next / Previous Navigation**: Navigate between sequential chapters using the top toolbar navigation buttons or the **End of Chapter Card** at the bottom of the Webtoon reader.
- **Pipeline Controls**: Use the toolbar menu to **Translate All**, **Cancel Translation**, or **Clear Progress** to re-translate with a different AI model or glossary theme.
`,
			},
		],
	},

	'getting-started/requirements': {
		title: 'System Requirements & Hardware Specs',
		description: 'Hardware recommendations and performance benchmarks across CPU, GPU, and Apple Silicon architectures.',
		lastUpdated: '2026-09-02',
		sections: [
			{
				id: 'hardware-tiers',
				title: 'Hardware Specification Matrix',
				content: `
XianScan is built in pure Rust with lock-free \`mimalloc\` memory allocation and SIMD optimizations:

| Tier | Minimum (CPU Only) | Recommended (Local GPU) | High-End / Server |
| :--- | :--- | :--- | :--- |
| **Processor** | 4-Core x86_64 with AVX2 or Apple M1+ | 6 to 8 Core CPU (AVX2 / AVX-512) | 8+ Core CPU / Modern Xeon / EPYC |
| **System RAM** | 8 GB (Engine RSS ~1.2 GB + image buffers) | 16 GB | 32 GB+ |
| **Graphics (VRAM)** | None (Integrated / CPU inference) | NVIDIA RTX 3060 / 4060 / 5060 (6 GB - 8 GB+) | NVIDIA RTX 4070+ / RTX 5080 / Tesla T4 / L4 / A10G (16 GB+) |
| **Translation Engine** | Cloud API (DeepSeek V4 Flash / Gemini 3.7) | Local 7B - 14B LLM (Qwen3.5) | Local 27B - 70B LLM (Qwen3.5:27B / Qwen3.8:27B / Llama 4) |
`,
			},
			{
				id: 'supported-providers',
				title: 'Supported Execution Providers (EP)',
				content: `
- **DirectML (Windows)**: Uses Win32 DXGI adapter enumeration to automatically route ONNX model inference to NVIDIA GeForce, AMD Radeon RX, or Intel Arc GPUs without external CUDA setup.
- **CUDA 12 + cuDNN 9 (Linux / Windows)**: Dedicated GPU acceleration with automated driver persistence mode (\`nvidia-smi -pm 1\`).
- **CoreML (macOS)**: Hardware acceleration on Apple Silicon (M1/M2/M3/M4) leveraging the Apple Neural Engine (ANE) and Metal compute.
- **CPU Fallback**: Multi-threaded SIMD inference for standard laptops and systems without dedicated graphics.
`,
			},
		],
	},

	'extensions/importer': {
		title: 'Browser Web Importer',
		description: '1-click chapter capture and live in-browser overlay translation for Chromium and Firefox browsers.',
		lastUpdated: '2026-09-02',
		sections: [
			{
				id: 'importer-overview',
				title: '1. What is the Browser Importer?',
				content: `
The **XianScan Web Extension** is a Manifest V3 browser extension that connects your web browser directly to your local XianScan server (\`http://localhost:8124\`) to provide:

- **In-Place Live Translation**: Replaces raw comic panels directly on the host website in real-time as background translation finishes, with smooth transitions and floating status badges.
- **1-Click Smart Chapter Presets**: Automatically detects chapter numbering from URL queries (\`?no=19\`, \`?episodeNo=19\`) and subtitles for instant 1-click import.
- **Intelligent Ad & Noise Shield**: Filters out floating banners, promo overlays, external click-trackers, and extreme aspect ratio banner ads (\`880×99\`).
- **4-Tier Smart Reader Scanner**: Automatically extracts full-resolution comic panels from DOM lazy attributes, JSON state trees, and virtual-scrolling readers.
- **Session-Preserving Background Streamer**: Downloads images using active tab cookies and referrer headers to bypass Cloudflare and hotlink protections.
`,
			},
			{
				id: 'importer-install',
				title: '2. Installation Guide',
				content: `
Download the ready-to-use extension assets directly from [GitHub Releases](https://github.com/ArbenApura/xianscan-rust/releases):

| Browser Family | Release Asset | Installation Steps |
| :--- | :--- | :--- |
| **Chrome / Edge / Brave / Opera** | \`xianscan-importer-v1.2.0.zip\` | 1. Extract the ZIP archive.<br>2. Open \`chrome://extensions/\` (or \`edge://extensions/\` / \`brave://extensions/\`).<br>3. Enable **Developer mode** in the top-right corner.<br>4. Click **Load unpacked** and select the extracted folder. |
| **Firefox / Floorp** | \`xianscan-importer-firefox-v1.2.0.xpi\` | 1. Open \`about:addons\` in Firefox.<br>2. Click the **Gear ⚙** icon and select **Install Add-on From File...** (or drag-and-drop the \`.xpi\` file into Firefox).<br>3. Alternatively, open \`about:debugging#/runtime/this-firefox\` and click **Load Temporary Add-on...**. |

*(For building from source and internal architecture, see [Extension & Client Architecture](/docs/advanced/extensions)).*
`,
			},
			{
				id: 'importer-usage',
				title: '3. Capturing and Translating Chapters',
				content: `
1. Ensure your XianScan server is running on \`http://localhost:8124\`.
2. Visit any online comic reader website.
3. Click the **XianScan extension icon** in your browser toolbar.
4. Click **Import to XianScan** to send chapter pages to your library, or toggle **Live In-Page Translate** to replace speech bubbles inline on the page in real time.
`,
			},
		],
	},

	'extensions/mihon': {
		title: 'Mihon Android App (Wi-Fi Sync)',
		description: 'Stream translated chapters over your local Wi-Fi LAN directly into Mihon, Tachiyomi, and Android comic readers.',
		lastUpdated: '2026-09-02',
		sections: [
			{
				id: 'mihon-overview',
				title: '1. Overview & Mihon App Download',
				content: `
With the official XianScan Mihon extension (\`extensions/xianscan-mihon\`), your local PC acts as a high-speed comic repository over your local Wi-Fi network (or over HTTPS via Cloudflare Tunnels). Read all your translated manga and manhua on Android phones, tablets, or e-ink readers (Boox, Meebook) with zero cloud upload.

#### Get the Mihon Reader App:
If you don't already have Mihon installed on your Android device:
- **Official Website**: [https://mihon.app/download/](https://mihon.app/download/)
- **GitHub Releases**: [https://github.com/mihonapp/mihon/releases](https://github.com/mihonapp/mihon/releases)
- *(Also fully compatible with Tachiyomi, TachiyomiSY, TachiyomiJ2K, and Aniyomi).*
`,
			},
			{
				id: 'add-repository',
				title: '2. Installing the XianScan Extension',
				content: `
#### Method A: Extension Repository (Recommended)

1. In Mihon, open **More** -> **Settings** -> **Browse** -> **Extension repos**.
2. Tap **+ Add** and paste the official repository URL:

\`\`\`text
https://raw.githubusercontent.com/ArbenApura/xianscan-rust/repo/index.min.json
\`\`\`

3. Go to **Browse** -> **Extensions**, search for **XianScan**, and tap **Install** (tap **Trust** if prompted).

---

#### Method B: Direct APK Download

1. Download the pre-built extension APK directly:
   - [tachiyomi-all.xianscan-v1.6.1-release.apk](https://raw.githubusercontent.com/ArbenApura/xianscan-rust/repo/apk/tachiyomi-all.xianscan-v1.6.1-release.apk)
2. In Mihon, open **Browse** -> **Extensions** -> **⚙ (top-right)** -> **Install from files**.
3. Select the downloaded APK file and tap **Trust** if prompted.
`,
			},
			{
				id: 'configure-connection',
				title: '3. Connecting Over Local Wi-Fi',
				content: `
1. In Mihon, go to **Browse** -> **Extensions**.
2. Tap the settings icon **⚙** next to **XianScan**.
3. Tap the settings icon **⚙** again next to **"Multi"**.
4. Tap **Server address**.
5. Enter your computer's local IP address and port 8124 (e.g. \`http://192.168.100.98:8124\`, no trailing slash).

You can find your LAN address printed directly in the XianScan startup terminal banner under **Network / LAN**:

![Terminal LAN Address](/showcase/lan_terminal_preview.png)

6. In **Browse** -> **Sources**, tap the filter icon and enable the **Multi** language tag.
7. Open **XianScan** under Sources to browse and read your translated library!

*(For Mihon REST protocol specifications and building from source, see [Extension & Client Architecture](/docs/advanced/extensions)).*
`,
			},
		],
	},

	'translation/models': {
		title: 'Choosing AI Providers (Local & Cloud)',
		description: 'Configuration guide and benchmark comparisons across local offline LLMs and cloud API translation providers.',
		lastUpdated: '2026-09-02',
		sections: [
			{
				id: 'providers-overview',
				title: '1. Configured AI Providers',
				content: `
XianScan features a universal OpenAI-compatible LLM client runtime with process-wide queue concurrency control, auto-retry, and reasoning tag suppression.
`,
			},
			{
				id: 'ollama-setup',
				title: '2. Setting Up Ollama (Local & Free Cloud)',
				content: `
1. Install [Ollama](https://ollama.com/) on your system.

#### Step 1: Start the Ollama Server
Ensure the Ollama daemon is running on \`http://localhost:11434\` (on Windows/macOS desktop apps, it starts automatically in the system tray; on headless servers or command line, start it with):

\`\`\`bash
ollama serve
\`\`\`

#### Step 2: Pull Your Model

**Option A: Local GPU Translation (Qwen 3.5 & Gemma 4)**
Pull your preferred multilingual comic localization model size:

\`\`\`bash
# 4B parameter model (recommended for 4GB - 6GB GPUs or CPU):
ollama pull qwen3.5:4b

# 9B parameter model (recommended for 8GB - 12GB GPUs / default):
ollama pull qwen3.5:9b

# 27B parameter model (recommended for 16GB+ GPUs / High-End):
ollama pull qwen3.5:27b

# Google Gemma 4 (12B parameter multimodal model):
ollama pull gemma4:12b
\`\`\`

**Option B: Free Cloud Acceleration via Ollama Account**
If you do not have a dedicated discrete GPU or want zero-VRAM inference, authenticate your local Ollama daemon to stream datacenter-grade cloud models for free:

\`\`\`bash
# Sign in to your Ollama account in terminal:
ollama signin

# Pull the free cloud-accelerated model:
ollama pull gemma4:cloud
\`\`\`

#### Step 3: Connect XianScan to Ollama
1. In XianScan, open **Settings** -> **AI Translation Providers** -> **Ollama (Local)**.
2. Confirm the Endpoint Base URL is set to \`http://localhost:11434/v1\`.
3. Set the active model name to your chosen model (e.g. \`qwen3.5:9b\` or \`gemma4:cloud\`).
4. Click **Test Connection** (XianScan will ping \`http://localhost:11434/v1/models\` to verify API connectivity).
`,
			},
			{
				id: 'dialogue-tracker',
				title: '3. Context-Aware Dialogue Memory & Tracking',
				content: `
XianScan employs a sliding-window cross-page dialogue context tracker (\`DialogueContextWindow\`) during translation. The tracker preserves up to 5 previous pages of speaker identity, pronouns, and topic context to maintain character voice consistency across page breaks.
`,
			},
		],
	},

	'translation/glossaries': {
		title: 'Preset Themes & Multilingual Glossaries',
		description: 'Explore the 7 specialized fiction theme packs, 20-language support matrix, and Aho-Corasick matching engine.',
		lastUpdated: '2026-09-02',
		sections: [
			{
				id: 'themes-breakdown',
				title: '1. The 7 Fiction Genre Theme Packs',
				content: `
XianScan includes built-in domain dictionaries compiled from web novel corpuses in \`master-glossary.json\`:

1. **Wuxia & Cultivation (\`xianxia\`)**: Standard terminology for Cultivation realms (Qi Condensation, Foundation Establishment, Golden Core, Nascent Soul, Tribulation), meridians, sects, alchemy, and artifacts.
2. **Murim & Martial Arts (\`murim\`)**: Standard terminology for Murim clans, martial sects (Shaolin, Wudang, Mount Hua, Tang Clan, Heavenly Demon), internal energy, and Qi deviation.
3. **Hunter & System Leveling (\`system\`)**: Standard terminology for Awakened hunters, gates, status windows, constellations, regressors, and hunter ranks (F to SSS).
4. **Fantasy & Isekai Guilds (\`fantasy\`)**: Standard terminology for Adventurers' Guilds, Demon Lords, Heroes, Saintesses, magic circles, and mana affinity.
5. **Romance Fantasy & Otome Isekai (\`rofan\`)**: Standard terminology for Villainesses, Grand Dukes, Crown Princes, debutantes, tea parties, and white lotuses.
6. **Imperial Palace & Court Drama (\`palace\`)**: Standard terminology for Emperors, Imperial Consorts, Cold Palace, Grand Secretariat, eunuchs, and royal court etiquette.
7. **Sci-Fi, Mecha & Sentinelverse (\`scifi\`)**: Standard terminology for Sentinels, Guides, mental landscapes, Mecha synchronization, quantum cores, and Zerg.
`,
			},
			{
				id: 'matching-engine',
				title: '2. Aho-Corasick Exact & Inverted 2-Gram Fuzzy Matching',
				content: `
Glossary matching is handled by a high-performance matching engine (\`glossary-match.ts\`):
- **Aho-Corasick Automaton**: Sub-millisecond exact string matching with NFKC unicode normalization.
- **Word-Boundary Enforcement**: Applied for Latin and Cyrillic languages so sub-words are not falsely matched.
- **Scriptura Continua Support**: Substring matching with whitespace stripping for CJK languages (Chinese, Japanese, Korean).
- **Fuzzy Typos & OCR Recovery**: Inverted 2-gram index to recover glossary terms damaged by OCR noise.
`,
			},
			{
				id: 'languages-matrix',
				title: '3. 20-Language Matrix',
				content: `
All 7 preset theme packs are compiled across 20 languages:

\`zh-Hans\` (Simplified Chinese), \`zh-Hant\` (Traditional Chinese), \`en\` (English), \`ja\` (Japanese), \`ko\` (Korean), \`es\` (Spanish), \`fr\` (French), \`de\` (German), \`ru\` (Russian), \`pt\` (Portuguese), \`it\` (Italian), \`id\` (Indonesian), \`tr\` (Turkish), \`nl\` (Dutch), \`pl\` (Polish), \`th\` (Thai), \`hi\` (Hindi), \`uk\` (Ukrainian), \`sv\` (Swedish), \`fi\` (Finnish).
`,
			},
		],
	},

	'advanced/gpu': {
		title: 'GPU Hardware Acceleration (CUDA, DirectML, CoreML)',
		description: 'Complete guide for configuring NVIDIA CUDA + cuDNN on Linux, DirectML on Windows, and CoreML on Apple Silicon.',
		lastUpdated: '2026-09-02',
		sections: [
			{
				id: 'directml-windows',
				title: '1. Windows: DirectML Acceleration (Zero-Setup)',
				content: `
On Windows, XianScan utilizes **DirectML** (\`ort/directml\`) by default. DirectML accelerates ONNX neural models across:
- **NVIDIA GeForce / RTX / Tesla** GPUs (GTX 1060+, RTX 20/30/40/50 series, Tesla T4, A10G)
- **AMD Radeon RX** GPUs (RX 5000/6000/7000 series)
- **Intel Arc / Iris Xe** GPUs and dedicated NPUs

XianScan uses Win32 DXGI adapter enumeration to detect all installed GPUs and automatically select your dedicated graphics card with dedicated VRAM. DirectML requires zero CUDA toolkit or SDK installations.

#### Cloud Windows Server Caveat (AWS EC2, Azure, Hetzner)
Fresh Windows Server instances default to the software-rendered \`Microsoft Basic Display Adapter\`, causing DirectML to fall back to CPU until a physical GPU display driver is installed. For NVIDIA instances (e.g. AWS G4dn), install the official display driver:

\`\`\`powershell
# Download and install the AWS-certified NVIDIA display driver silently:
& "C:\\\\Program Files\\\\Amazon\\\\AWSCLIV2\\\\aws.exe" s3 cp --no-sign-request s3://ec2-windows-nvidia-drivers/latest/596.86__grid_win10_win11_server2022_server2025_dch_64bit_international_aws_swl.exe C:\\\\NVIDIA\\\\installer.exe
Start-Process -FilePath "C:\\\\NVIDIA\\\\installer.exe" -ArgumentList "-s -clean -noreboot" -Wait
\`\`\`

#### Verify DirectML Hardware Recognition:
\`\`\`powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8123/system/hardware" | ConvertTo-Json
\`\`\`
DirectML should report \`"active_provider": "DmlExecutionProvider"\` and identify your dedicated GPU.
`,
			},
			{
				id: 'cuda-linux',
				title: '2. Linux: NVIDIA CUDA 12 & cuDNN 9 Setup',
				content: `
For dedicated Linux machines and cloud servers (Ubuntu 22.04/24.04/26.04, Debian 12+, AWS EC2 G4dn/G5/G6, Hetzner GPU):

#### Step 1: Install NVIDIA Driver & CUDA Toolkit
\`\`\`bash
# 1. Disable conflicting nouveau driver
echo "blacklist nouveau" | sudo tee /etc/modprobe.d/blacklist-nouveau.conf
echo "options nouveau modeset=0" | sudo tee -a /etc/modprobe.d/blacklist-nouveau.conf
sudo update-initramfs -u

# 2. Install kernel headers and driver
sudo apt-get update -y
sudo apt-get install -y linux-headers-$(uname -r) nvidia-driver-550-server nvidia-cuda-toolkit
sudo reboot
\`\`\`

#### Step 2: Install NVIDIA cuDNN 9 Libraries
ONNX Runtime dynamically links against \`libcudnn.so\` and sub-modules (\`libcudnn_cnn.so.9\`, \`libcudnn_ops.so.9\`, \`libcudnn_graph.so.9\`) for Koharu RF-DETR and RapidOCR convolution kernels:

\`\`\`bash
# 1. Install cuDNN 9 via official NVIDIA wheel
sudo apt-get install -y python3-pip
pip install --break-system-packages nvidia-cudnn-cu12

# 2. Add cuDNN wheel library directory to ld.so.conf and update cache
CUDNN_PATH=$(python3 -c "import nvidia.cudnn, os; print(os.path.join(os.path.dirname(nvidia.cudnn.__file__), 'lib'))")
echo "$CUDNN_PATH" | sudo tee /etc/ld.so.conf.d/nvidia-cudnn.conf
sudo ldconfig

# 3. Optional convenience symlinks in system library directory
sudo ln -sf "$CUDNN_PATH"/libcudnn*.so* /usr/lib/x86_64-linux-gnu/
sudo ldconfig
\`\`\`

#### Step 3: Launch with CUDA Library Path
\`\`\`bash
CUDNN_LIB=$(python3 -c "import nvidia.cudnn, os; print(os.path.join(os.path.dirname(nvidia.cudnn.__file__), 'lib'))" 2>/dev/null)
export LD_LIBRARY_PATH="$HOME/xianscan-app:\${CUDNN_LIB}:/usr/local/cuda/lib64:/usr/local/cuda/targets/x86_64-linux/lib:/usr/lib/x86_64-linux-gnu:\$LD_LIBRARY_PATH"
./xianscan
\`\`\`
`,
			},
			{
				id: 'coreml-macos',
				title: '3. macOS: Apple Silicon (CoreML / Metal)',
				content: `
On macOS with Apple Silicon (M1, M2, M3, M4), XianScan routes neural tensor operations through Apple's **CoreML Execution Provider**, offloading compute to the 16-core Apple Neural Engine (ANE) and Metal graphics with unified memory access.
`,
			},
			{
				id: 'systemd-gpu',
				title: '4. Systemd Daemon with GPU Environment',
				content: `
For 24/7 background operation on Linux servers, configure a systemd service with \`LD_LIBRARY_PATH\` pointing to the application, cuDNN wheel, and CUDA library targets:

\`\`\`ini
[Unit]
Description=XianScan Translation Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/xianscan-app
ExecStart=/home/ubuntu/xianscan-app/xianscan --host 0.0.0.0 --port 8124
Restart=always
RestartSec=5
Environment=PORT=8124
Environment=LD_LIBRARY_PATH=/home/ubuntu/xianscan-app:/home/ubuntu/.local/lib/python3.12/site-packages/nvidia/cudnn/lib:/usr/local/cuda/lib64:/usr/local/cuda/targets/x86_64-linux/lib:/usr/lib/x86_64-linux-gnu
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
\`\`\`
`,
			},
			{
				id: 'hardware-api',
				title: '5. Dynamic Device Switching & Telemetry',
				content: `
Switch hardware execution providers or set VRAM limits dynamically at runtime via REST API or Web Settings:

\`\`\`bash
# Query active hardware telemetry and GPU info
curl http://localhost:8124/api/system/hardware

# Switch active provider to CUDA with 8GB VRAM cap via Web API (Port 8124)
curl -X POST http://localhost:8124/api/system/hardware \\
  -H "Content-Type: application/json" \\
  -d '{"device": "cuda", "vram_limit_mb": 8192}'

# Or switch directly on the Axum ML sidecar (Port 8123)
curl -X POST http://localhost:8123/system/device \\
  -H "Content-Type: application/json" \\
  -d '{"provider": "cuda", "vram_limit_mb": 8192}'
\`\`\`
`,
			},
		],
	},

	'advanced/ml-pipeline': {
		title: 'ML Pipeline & Inpainting Engine',
		description: 'Architectural breakdown of text detection, multilingual OCR reading flow, LaMa neural inpainting, and typesetting.',
		lastUpdated: '2026-09-02',
		sections: [
			{
				id: 'pipeline-stages',
				title: '1. The 6-Stage Neural Architecture',
				content: `
XianScan executes a modular, multi-threaded neural pipeline implemented directly in native Rust:

\`\`\`text
[Raw Webtoon Strip / Comic Page]
   │
   ▼
1. Webtoon Gutter Reslicing (src/ml/reslice.rs)
   │ ── Detects non-text whitespace valleys and avoids slicing panels/bubbles
   ▼
2. Bubble & Text Line Detection (src/ml/detect/)
   │ ── Koharu RF-DETR Seg 2XL & DBNet extract oriented polygon contours
   ▼
3. Multi-Script OCR & Reading Flow Fusion (src/ml/ocr/ & src/pipeline/fusion.rs)
   │ ── RapidOCR (10 languages) with cultural flow sorting (RTL Manga / LTR Webtoons)
   ▼
4. Context-Aware LLM Translation & Glossaries (web/src/lib/server/translate/)
   │ ── 5-page sliding dialogue tracker + Aho-Corasick multilingual domain dictionaries
   ▼
5. Neural Background Inpainting (src/ml/inpaint/)
   │ ── 1:1 localized patch cropping with LaMa Fast Fourier Convolutions (FFC)
   ▼
6. Automated Typography & Typesetting (web/src/lib/server/typeset/)
   │ ── Google Skia binary-search font sizing, outline strokes, and bubble tilt
   ▼
[Cleaned & Typeset Comic Canvas]
\`\`\`
`,
			},
			{
				id: 'bubble-detection',
				title: '2. Speech Bubble Detection & Spatial Region Building',
				content: `
- **Koharu RF-DETR Seg 2XL (\`src/ml/detect/rfdetr.rs\`)**: High-resolution transformer segmentation model that outputs exact polygon boundaries for oval speech bubbles, jagged scream bubbles, and rectangular narrative caption boxes.
- **DBNet Polygon Extraction (\`src/ml/detect/dbnet.rs\`)**: Differentiable Binarization text detector capturing fine-grained character bounding coordinates and orientation angles.
- **Spatial Clustering & Deduplication (\`src/pipeline/region_builder/\`)**:
  - \`clustering.rs\`: Aggregates overlapping or adjacent text lines into coherent dialogue blocks.
  - \`expansion.rs\`: Expands text bounding boxes with configurable safety padding to ensure full glyph coverage.
  - \`dedup.rs\`: Resolves conflicting bounding boxes using Intersection-over-Union (IoU) heuristics.
`,
			},
			{
				id: 'ocr-reading-flow',
				title: '3. Multi-Language OCR & Cultural Reading Flow',
				content: `
- **RapidOCR PP-OCRv6 Engine (\`src/ml/ocr/engine.rs\`)**: Embedded multi-lingual OCR pipeline supporting 10 languages:
  - Chinese (Simplified & Traditional), Japanese (Kanji, Hiragana, Katakana), Korean (Hangul), Thai, Indonesian, English, Spanish, French, Russian.
- **Cultural Reading Flow Sorter (\`src/ml/detect/grouping.rs\` & \`src/pipeline/fusion.rs\`)**:
  - **Japanese Manga**: Right-to-Left (RTL) reading flow. Iterates vertical text columns from right to left within horizontal narrative bands.
  - **Korean Manhwa & Chinese Manhua**: Top-to-Bottom vertical flow with left-to-right reading hierarchy.
`,
			},
			{
				id: 'lama-inpainting',
				title: '4. LaMa Neural Inpainting & 1:1 Local Patching',
				content: `
- **Large Mask Inpainting (LaMa) Architecture (\`src/ml/inpaint/lama.rs\`)**: Utilizes Fast Fourier Convolutions (FFC) with global receptive fields to reconstruct complex background textures, screentone patterns, and gradients.
- **1:1 Localized Patch Cropping Engine (\`src/ml/inpaint/patch.rs\`)**:
  - Traditional inpainting tools downscale entire 4K comic canvases to 512x512, causing severe blurriness across the whole page.
  - XianScan crops tight local patches around detected dialogue bubbles, inpaints each patch at native resolution, and composites them back seamlessly onto the unedited source image.
- **Solid Background Fast Path (\`is_solid_background_patch\`)**:
  - Automatically identifies solid / flat white speech bubbles and replaces them instantly with exact color fills, bypassing GPU neural execution for sub-millisecond performance.
`,
			},
			{
				id: 'typesetting-engine',
				title: '5. Automated Typesetting & Typography Studio',
				content: `
- **Google Skia Canvas Engine (\`@napi-rs/canvas\`)**: Native high-performance 2D graphics rendering embedded directly in the server.
- **Binary Search Font Sizing (\`web/src/lib/server/typeset/layout.ts\`)**: Dynamically computes the maximum legible font size that fits comfortably within the speech bubble's polygon mask.
- **Multi-Line Text Wrapping & Hyphenation**: Balances line lengths to prevent orphan words and maintain aesthetic dialogue shapes.
- **Outline Strokes & Bubble Tilt**: Applies configurable contrast outline strokes and rotates text lines to match the orientation angle of tilted dialogue bubbles.
`,
			},
		],
	},

	'advanced/api': {
		title: 'REST API & Automation',
		description: 'Comprehensive REST API documentation, Axum backend endpoints, and SvelteKit routes.',
		lastUpdated: '2026-09-02',
		sections: [
			{
				id: 'api-endpoints',
				title: 'Core REST Endpoints',
				content: `
### Axum ML Inference Endpoints (\`http://localhost:8123\`)

| Method & Route | Description |
| :--- | :--- |
| \`GET /health\` | Server status, version, accelerator, and active providers |
| \`GET /system/hardware\` | Hardware telemetry, VRAM usage, and model reload state |
| \`POST /system/device\` | Switch active provider (\`"auto"\`, \`"directml"\`, \`"cuda"\`, \`"coreml"\`, \`"cpu"\`) |
| \`GET /system/telemetry\` | Active and queued OCR jobs, CPU & host RAM stats |
| \`POST /pages/analyze\` | Multipart image upload -> detection, OCR, text regions |
| \`POST /pages/clean\` | Multipart image + regions JSON -> LaMa neural inpainting |
| \`POST /pages/preprocess\` | Normalize and optimize page image bytes |
| \`POST /pages/stitch\` | Vertical two-panel canvas stitching |
| \`POST /pages/reslice\` | Multi-image webtoon smart gutter slicing |
| \`GET /pages/reslice/status\` | Real-time percentage polling for smart reslice |
| \`POST /pages/reslice/cancel\` | Cancel ongoing smart reslice job |
| \`POST /pages/reslice/reset\` | Reset smart reslice worker state and initialize run ID |

---

### SvelteKit Web & Library Endpoints (\`http://localhost:8124/api\`)

| Method & Route | Description |
| :--- | :--- |
| \`GET /api/books\` | List all books with chapter counts and telemetry |
| \`POST /api/books\` | Create a new book series in the library |
| \`GET /api/books/:id\` | Get book metadata, chapter index, and preferences |
| \`POST /api/books/:id/chapters\` | Create a new chapter under a book |
| \`GET /api/chapters/:id\` | Get chapter pages, status, and translated regions |
| \`POST /api/chapters/:id/pages\` | Upload raw page images (\`multipart/form-data\`) |
| \`POST /api/chapters/:id/translate\` | Trigger translation pipeline for a chapter |
| \`GET /api/chapters/:id/translate\` | Real-time SSE progress event stream |
| \`DELETE /api/chapters/:id/translate\` | Cancel running chapter translation job |
| \`POST /api/translate-text\` | Direct LLM text translation with dynamic dialogue memory |
| \`GET /api/system/hardware\` | Query active GPU, VRAM limits, and hardware capabilities |
| \`POST /api/system/hardware\` | Set hardware provider and VRAM ceiling |
| \`GET /api/glossary\` | Fetch compiled system preset themes and custom terms |
| \`POST /api/glossary\` | Insert or update custom glossary entries |
| \`GET /api/pages/:id/file?kind=output\` | Retrieve rendered page image (\`output\`, \`cleaned\`, \`original\`, \`thumb\`) |
| \`GET /api/mihon/*\` | Mihon / Tachiyomi source protocol endpoints |
`,
			},
		],
	},

	'advanced/extensions': {
		title: 'Extension & Client Architecture',
		description: 'Internal architecture, build pipelines, and protocol specifications for the Browser Importer and Mihon Android extension.',
		lastUpdated: '2026-09-02',
		sections: [
			{
				id: 'importer-architecture',
				title: '1. Browser Web Importer Architecture & Build',
				content: `
The **XianScan Browser Importer** (\`extensions/xianscan-importer\`) is built with TypeScript and esbuild, targeting Manifest V3:

- **Chromium vs Firefox Bundling**: \`build.js\` outputs two distinct packages:
  - \`dist/\`: Targets Chromium (Chrome, Edge, Brave, Opera) with a Manifest V3 background service worker (\`background.service_worker: "background.js"\`).
  - \`dist-firefox/\`: Targets Gecko (Firefox, Floorp) with a Manifest V3 event page (\`background.scripts: ["background.js"]\`) and \`browser_specific_settings.gecko\` ID.
- **4-Tier Smart Reader Scanner** (\`content.ts\`):
  1. High-priority DOM element analysis inspecting \`data-src\`, \`data-original\`, \`data-lazy-src\`, \`srcset\`, and \`currentSrc\`.
  2. CSS \`background-image\` container parsing.
  3. Embedded JSON state tree extraction (\`script[type="application/json"]\`) when fewer than 3 DOM images are mounted.
  4. Virtual-scrolling mutation observer queueing placeholders for off-screen canvas rendering.

#### Compiling the Importer from Source:
\`\`\`bash
# 1. Navigate to the importer extension directory
cd extensions/xianscan-importer

# 2. Install dependencies and build both Chromium and Firefox bundles
yarn install
yarn build
\`\`\`
`,
			},
			{
				id: 'mihon-protocol',
				title: '2. Mihon Android Protocol & APK Build',
				content: `
The **XianScan Mihon Extension** (\`extensions/xianscan-mihon\`) implements the native Tachiyomi / Mihon Kotlin extension specification (\`eu.kanade.tachiyomi.extension.all.xianscan\`):

#### Server-Side Protocol Endpoints:
The SvelteKit server implements the following Mihon source routes on port \`8124\`:

| Endpoint | Purpose |
| :--- | :--- |
| \`GET /api/mihon/library?page=N&status=&genre=\` | Recent-first library with status and genre filtering |
| \`GET /api/mihon/search?q=&page=N&status=&genre=\` | Full-text library search with category tags |
| \`GET /api/mihon/genres\` | Distinct string array of active book genre tags |
| \`GET /api/mihon/manga/<id>\` | Series metadata, author, artist, status, and cover URL |
| \`GET /api/mihon/manga/<id>/chapters\` | Ordered chapter index |
| \`GET /api/mihon/chapters/<id>/pages\` | Ordered page stream URLs |
| \`GET /api/covers/<id>/file?w=512\` | Cover thumbnails with dynamic image resizing |

#### Compiling the Extension APK from Source:
\`\`\`bash
cd extensions/xianscan-mihon

# Build debug APK (requires Android SDK + JDK 17):
./gradlew :app:assembleDebug

# Build signed release APK:
./gradlew :app:assembleRelease
\`\`\`
`,
			},
		],
	},

	'advanced/self-hosting': {
		title: 'Remote Server & Cloudflare Tunnels',
		description: 'Deploy headless GPU servers (AWS EC2 / Hetzner) and configure zero-trust Cloudflare Tunnels.',
		lastUpdated: '2026-09-02',
		sections: [
			{
				id: 'systemd-daemon',
				title: '1. Linux Systemd Service Setup',
				content: `
Create a systemd unit file at \`/etc/systemd/system/xianscan.service\`:

\`\`\`ini
[Unit]
Description=XianScan Comic Translation Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/xianscan
ExecStart=/home/ubuntu/xianscan/xianscan
Restart=always
RestartSec=5
Environment=PORT=8124
Environment=RUST_LOG=info
Environment=DATA_ROOT=/home/ubuntu/xianscan/data

[Install]
WantedBy=multi-user.target
\`\`\`

Enable and start the service:

\`\`\`bash
sudo systemctl daemon-reload
sudo systemctl enable --now xianscan
\`\`\`
`,
			},
			{
				id: 'windows-scheduled-task',
				title: '2. Windows Server Background Task (24/7 Service)',
				content: `
On Windows Server (AWS EC2, Azure, Hetzner, or on-premise), run XianScan persistently across reboots and RDP/SSH disconnects by registering it under the \`SYSTEM\` account:

\`\`\`powershell
# 1. Allow ports through Windows Defender Firewall for all profiles
New-NetFirewallRule -Name "XianScan-Web-8124" -DisplayName "XianScan Web Studio" -Protocol TCP -LocalPort 8124 -Action Allow -Profile Any
New-NetFirewallRule -Name "XianScan-ML-8123" -DisplayName "XianScan ML API" -Protocol TCP -LocalPort 8123 -Action Allow -Profile Any

# 2. Register persistent Scheduled Task at system startup
$action = New-ScheduledTaskAction -Execute "C:\\\\xianscan\\\\xianscan.exe" -WorkingDirectory "C:\\\\xianscan"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName "XianScanService" -Action $action -Trigger $trigger -Principal $principal -Force
Start-ScheduledTask -TaskName "XianScanService"
\`\`\`
`,
			},
			{
				id: 'cloudflare-tunnels',
				title: '3. Cloudflare Tunnel Remote Ingress',
				content: `
Securely access your home server or remote GPU instance over HTTPS without port forwarding:

1. Install \`cloudflared\` on your server:

\`\`\`bash
sudo apt-get install cloudflared
\`\`\`

2. Authenticate and create a tunnel:

\`\`\`bash
cloudflared tunnel login
cloudflared tunnel create xianscan-server
\`\`\`

3. Route traffic to your local XianScan port (\`8124\`) in \`~/.cloudflared/config.yml\`:

\`\`\`yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/ubuntu/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: manga.yourdomain.com
    service: http://localhost:8124
  - service: http_status:404
\`\`\`

4. Run the tunnel service:

\`\`\`bash
sudo cloudflared service install
sudo systemctl start cloudflared
\`\`\`

You can now access your XianScan server and Mihon extensions securely from anywhere at \`https://manga.yourdomain.com\`!
`,
			},
		],
	},
};
