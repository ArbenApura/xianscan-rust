// ==============================================================================
// XIANSCAN DOCUMENTATION CONTENT
// One entry per docs page, keyed by its slug (see docs-nav.ts for the order).
// Keep UI labels exactly as the app shows them, and check every claim against
// src/ (engine), web/ (studio) and extensions/ before changing it.
// Style: plain words, no em dashes, user pages say what to click and what happens.
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
		title: 'Quick Start',
		description: 'Download XianScan, connect a translation model, and translate your first chapter.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'download',
				title: '1. Download',
				content: `
Get the archive for your system from [GitHub Releases](https://github.com/ArbenApura/xianscan-rust/releases). The detection, OCR and cleaning models are built in, so nothing else is downloaded when you first start it.

| System | Download | GPU acceleration |
| :--- | :--- | :--- |
| **Windows 10 / 11** (64-bit) | \`xianscan-windows-x86_64.zip\` | DirectML on a dedicated NVIDIA, AMD or Intel Arc GPU |
| **Linux** (x86_64) | \`xianscan-linux-x86_64.tar.gz\` | NVIDIA CUDA 13 (driver and libraries installed separately, see [GPU Acceleration](/docs/advanced/gpu)) |
| **macOS** (Apple Silicon) | \`xianscan-macos-arm64.tar.gz\` | CoreML |
| **Docker** (Linux x86_64) | \`ghcr.io/arbenapura/xianscan:latest\` | CPU only |

Without a supported GPU, everything runs on the CPU. It works, just more slowly.

Extract the whole archive into its own folder and keep the files together. The Windows ZIP includes \`DirectML.dll\` and the Linux archive includes the ONNX Runtime GPU libraries; they must stay next to the program.

To check a download, compare it with \`SHA256SUMS.txt\` from the same release: \`sha256sum -c SHA256SUMS.txt --ignore-missing\` on Linux and macOS, or \`Get-FileHash xianscan-windows-x86_64.zip\` in PowerShell.
`,
			},
			{
				id: 'start',
				title: '2. Start XianScan',
				content: `
#### Windows
Double-click \`xianscan.exe\`. A console window opens and shows the startup log. If Windows SmartScreen warns you, click **More info** -> **Run anyway**.

#### macOS
The binary is not signed by Apple, so remove the download quarantine once, then start it from Terminal:

\`\`\`bash
cd ~/Downloads/xianscan    # the folder you extracted
xattr -dr com.apple.quarantine .
./xianscan
\`\`\`

#### Linux

\`\`\`bash
chmod +x xianscan
./xianscan
\`\`\`

#### Docker

\`\`\`bash
docker run -d --name xianscan \\
  -p 8124:8124 \\
  -v xianscan-config:/config \\
  --restart unless-stopped \\
  ghcr.io/arbenapura/xianscan:latest
\`\`\`

In Docker every browser needs the access token once, even on the same computer. Print it with \`docker exec xianscan /app/xianscan --print-token\`. More in [Remote Server & Docker](/docs/advanced/self-hosting).

The first start takes a little longer while XianScan unpacks its web app. When it is ready, the console shows a banner with the address:

![XianScan startup console](/showcase/terminal_launch.png)

Open **[http://localhost:8124](http://localhost:8124)** in your browser. Keep the console window open while you use XianScan; closing it stops the server.
`,
			},
			{
				id: 'provider',
				title: '3. Connect a Translation Model',
				content: `
XianScan reads and cleans pages on your computer, but the translation itself comes from a large language model (LLM). Pick one of these before you translate:

**Option A: free and local, with Ollama (the default).** XianScan is preconfigured for Ollama with the \`qwen3.5:9b\` model. Install [Ollama](https://ollama.com/), then download the model:

\`\`\`bash
ollama pull qwen3.5:9b
\`\`\`

That is all; XianScan finds Ollama at \`http://localhost:11434/v1\`. A GPU with 8 GB or more of memory is recommended for this model. For smaller GPUs, see [Translation Providers](/docs/translation/models).

**Option B: a cloud API (DeepSeek, Google AI Studio, OpenAI, Groq, OpenRouter).** Faster on computers without a strong GPU, and usually cheap.

1. Click **Settings** (the gear icon) -> **AI Translation Providers**.
2. Click **Switch Provider** and choose your provider.
3. Paste your **API Key**, and pick a **Model**.
4. Click **Test Connection**, then **Save & Set Active**.
`,
			},
			{
				id: 'first-chapter',
				title: '4. Translate Your First Chapter',
				content: `
1. In the **Library**, click **New Book**. Enter a title and choose the **Source Language** (the language of the scans) and the **Target Language** (the language you want).
2. Open the book and click **New Chapter**, then **Create & Open**.
3. Drag your page images (or a folder of them) into the chapter, or click **Add Images**. Pages are sorted by file name, so \`2.jpg\` comes before \`10.jpg\`. Supported formats are PNG, JPEG, WebP, AVIF and HEIC, up to 32 MB per file.
4. Click **Translate All**. A progress widget appears; you can drag it anywhere or minimize it. Pages update one by one as they finish.
5. Read the result in the **Webtoon** view, or download it with **Export ZIP**.

**Shortcut:** drag a folder onto the Library (or click **Import Folder**) to create a book in one step. A folder that contains chapter subfolders becomes one chapter per subfolder.
`,
			},
			{
				id: 'next-steps',
				title: 'Next Steps',
				content: `
- [Using the Studio](/docs/getting-started/reading): view modes, fixing a page, re-slicing webtoons and exporting.
- [Other Devices & Access Token](/docs/getting-started/network-access): read on your phone or another PC.
- [Browser Importer](/docs/extensions/importer) and [Mihon](/docs/extensions/mihon): import from comic sites and read on Android.
- [Troubleshooting](/docs/getting-started/troubleshooting) if something does not work.
`,
			},
		],
	},

	'getting-started/reading': {
		title: 'Using the Studio',
		description: 'Import pages, switch view modes, fix individual pages, re-slice webtoons, and export chapters.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'importing',
				title: '1. Importing Pages',
				content: `
There are three ways to bring pages in:

- **Into a chapter:** drag images or a folder into the open chapter, or click **Add Images**.
- **Into a book:** on the book page, click **Import Folder** to add several chapter folders at once.
- **As a new book:** drag a folder onto the Library, or click **Import Folder** there.

Pages are sorted naturally by file name (\`2\` before \`10\`). Accepted formats are PNG, JPEG, WebP, AVIF and HEIC. Each file may be up to 32 MB and 100 megapixels.

You can also import straight from comic websites with the [Browser Importer](/docs/extensions/importer).
`,
			},
			{
				id: 'view-modes',
				title: '2. Chapter View Modes',
				content: `
Switch views in the chapter toolbar:

- **Webtoon:** continuous vertical reading on a dark background. On larger screens, **SM / MD / LG** sets the reading width.
- **Grid:** thumbnails of every page with a status badge (**Pending**, **Queued**, **Processing**, **Translated**, **Error**). Drag pages to reorder them.
- **Compare:** the original page and the translated page side by side.

In Webtoon and Grid, the **Translated / Original** toggle switches between the result and the raw scans.

In Grid view you can select several pages and use **Translate selected**, **Select Errored**, **Merge with Page N+1** (join a speech bubble that was cut in two), **Remove from Queue** or **Clear Progress**.
`,
			},
			{
				id: 'translating',
				title: '3. Translating and Re-translating',
				content: `
- **Translate All** (shown as **Translate** on narrow screens) queues every page in the chapter. **Cancel** stops it.
- **Clear Progress** removes translations and cleaning but keeps the pages, so you can translate again, for example with a different model or glossary. **Clear Pages** removes the pages themselves.
- On the book page, **Translate Pending** queues every chapter that is not finished, and **Clear All Progress** resets the whole book.

The progress widget has a **Queue** tab (drag chapters to change their order) and a **Telemetry** tab (CPU, memory and GPU use).
`,
			},
			{
				id: 'page-inspector',
				title: '4. Fixing a Page (Page Inspector)',
				content: `
Click a page in Grid or Compare view, or use **Inspect Page Details** in Webtoon view, to open the Page Inspector.

- **Original**, **Translated Output** and **Cleaned** tabs show each stage of the page (the last two appear once they exist).
- **OCR**, **Inpaint** and **Typeset** overlays show the detected text areas, what was cleaned, and where the translation was placed.
- Click a text region to read the recognized source text and edit its translation, or ask the AI for a new one.
- Skill names, attacks and title cards the translator marked as accent text show an **Accent** badge (the tooltip says who marked it: AI, Glossary or You). In the region editor, **Lettering** switches a region between **Dialogue** and **Accent**. Re-translating the page resets these switches. See [Accent Font](/docs/advanced/typography#accent-font).
- **Retypeset** redraws the text only (fast, keeps your edits). **Re-translate Page** runs the whole page again from the start.
- **OCR Pipeline** opens the recognition details, including a confidence score for each region.
- **LLM Prompt** shows exactly what was sent to the translation model, and **Copy Debug** copies the page details for a bug report.
`,
			},
			{
				id: 'reslice',
				title: '5. Re-slicing Webtoons',
				content: `
Webtoon chapters are often cut into image strips at random heights, which can split a speech bubble across two images. Re-slicing joins the strips and cuts them again in the empty gaps between panels, so no bubble is cut.

- **Automatic:** **Auto-Reslice Before Batch Translation** (in **Settings** -> **Hardware & Compute**) is on by default. It re-slices a chapter before a full-chapter translation, unless the chapter was already re-sliced or is too large.
- **Manual:** click **Reslice** in the chapter toolbar (**Smart Re-slice** in the menu on phones).

A re-slice takes up to 400 images and 200 megapixels in total. Larger chapters are translated on their original pages instead.
`,
			},
			{
				id: 'reading-export',
				title: '6. Reading and Exporting',
				content: `
- **Prev / Next** in the toolbar, and the card at the end of each chapter, take you to the neighbouring chapters.
- **Export ZIP** (in the chapter toolbar, or **ZIP** in the chapter list) downloads the chapter as one folder of images. Pages without a translation use the original image; pages with no readable image at all are listed in \`MISSING_PAGES.txt\` inside the ZIP.
- **Settings** -> **General & Appearance** -> **Reader Surface Theme** switches between Auto, Light, Sepia and Dark.
- To read on a phone, use [Mihon](/docs/extensions/mihon) or open XianScan's address from the phone's browser ([Other Devices](/docs/getting-started/network-access)).
`,
			},
			{
				id: 'organizing',
				title: '7. Organizing Your Library',
				content: `
- Drag the handle next to a chapter to change the reading order, or set **Reading Order Position** in the chapter details.
- **Directives** on the book page lets you give the translator book-specific instructions, such as tone or honorifics. See [Glossaries & Directives](/docs/translation/glossaries).
- The search box at the top of **Settings** finds any setting by name.
`,
			},
		],
	},

	'getting-started/requirements': {
		title: 'System Requirements',
		description: 'Supported systems, recommended hardware, and which GPUs XianScan can use.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'systems',
				title: 'Supported Systems',
				content: `
- **Windows 10 or 11**, 64-bit (x86_64).
- **Linux** x86_64 with a recent C library. The release is built on Ubuntu 24.04, so older distributions such as Ubuntu 20.04 cannot run it. On an older system, use the Docker image instead.
- **macOS** on Apple Silicon (M1 or newer). There is no Intel Mac build.
- **Docker** on any Linux x86_64 host.
`,
			},
			{
				id: 'hardware',
				title: 'Hardware',
				content: `
| | Minimum | Recommended |
| :--- | :--- | :--- |
| **CPU** | 4 cores | 6 cores or more |
| **Memory** | 8 GB | 16 GB |
| **GPU** | Not required | A dedicated GPU with 6 GB or more of memory (see below) |
| **Disk** | About 2 GB for the app | Plus room for your library; every page is stored as original, cleaned and translated images |

The translation model is separate from this:

- **Cloud API** (DeepSeek, Google AI Studio and others): no extra hardware.
- **Local model with Ollama or LM Studio**: needs GPU memory of its own. As a rough guide, \`qwen3.5:4b\` fits 4 to 6 GB, \`qwen3.5:9b\` 8 to 12 GB, and \`qwen3.5:27b\` 16 GB or more. The XianScan models and the local LLM share the GPU.
`,
			},
			{
				id: 'gpu-support',
				title: 'Which GPUs Are Used',
				content: `
| System | Used for | Notes |
| :--- | :--- | :--- |
| **Windows** | Detection and cleaning, through DirectML | Only on a dedicated NVIDIA, AMD or Intel Arc GPU. Text recognition (OCR) always runs on the CPU on Windows. No CUDA install is needed. |
| **Linux** | Detection, OCR and cleaning, through CUDA | NVIDIA only. Needs the NVIDIA driver, CUDA 13 and cuDNN 9, see [GPU Acceleration](/docs/advanced/gpu). |
| **macOS** | Detection, OCR and cleaning, through CoreML | Apple Silicon. |
| **Docker** | CPU only | For a GPU on Linux, run the native binary instead. |

Integrated graphics (Intel UHD / Iris, AMD Radeon Graphics / Vega) are skipped on purpose and run on the CPU, because they are usually slower than the CPU for these models.

If a GPU fails to start a model (for example because of a missing library), XianScan switches to the CPU so pages keep working, and stays on the CPU until you choose a device again in **Settings** -> **Hardware & Compute** or restart XianScan.
`,
			},
		],
	},

	'getting-started/network-access': {
		title: 'Other Devices & Access Token',
		description: 'Use XianScan from a phone, tablet or another computer, and how the access token protects it.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'default',
				title: '1. How Access Works',
				content: `
By default XianScan only accepts connections from the computer it runs on, and a browser on that computer needs no password.

Everything else needs the **access token**, a long random key that XianScan creates on first start:

- phones, tablets and other computers on your network,
- the [Browser Importer](/docs/extensions/importer), even on the same computer,
- the [Mihon extension](/docs/extensions/mihon),
- anything that reaches XianScan through a tunnel or reverse proxy,
- every browser when XianScan runs in Docker.

A browser asks for the token once on an unlock page and then remembers it. Apps send it with each request.
`,
			},
			{
				id: 'enable-lan',
				title: '2. Turn On LAN Access',
				content: `
1. Open **Settings** -> **Network & Access** and turn on **LAN access**.
2. Restart XianScan (close the console window and start it again).
3. On the other device, open one of the **network addresses** listed in the same section, for example \`http://192.168.1.20:8124\`.
4. Paste the access token on the unlock page.

The same addresses are printed in the startup banner under **Network / LAN**:

![LAN address in the startup banner](/showcase/lan_terminal_preview.png)

You can also start XianScan with \`xianscan --lan\`, or set \`XIANSCAN_BIND=lan\`. When the flag or variable is used, the switch in Settings is locked. Docker always uses LAN mode.

If your firewall asks whether to allow XianScan, allow it on private networks. Only port 8124 needs to be reachable; never open port 8123 (it is internal).
`,
			},
			{
				id: 'token',
				title: '3. The Access Token',
				content: `
- **Copy it** from **Settings** -> **Network & Access**, or print it with \`xianscan --print-token\` (in Docker: \`docker exec xianscan /app/xianscan --print-token\`).
- **Replace it** with **Regenerate** in the same section if it leaked. Every paired device, the browser extension and Mihon then need the new token.
- **Where it is stored:** a file named \`access-token\` in the XianScan data folder (see [Your Data & Updates](/docs/getting-started/data-and-updates)).

If you upgraded from a version before access control, with an existing library, LAN access stays on so your devices keep working, but they now need the token.
`,
			},
			{
				id: 'internet',
				title: '4. Access From the Internet',
				content: `
Do not forward port 8124 on your router. To reach XianScan from outside your home, use a tunnel with a login in front of it, as described in [Remote Server & Docker](/docs/advanced/self-hosting#cloudflare-tunnels).

If you put a reverse proxy on the same machine, make sure it passes the original \`Host\` header or adds \`X-Forwarded-For\`, so its requests are not mistaken for local ones. To remove the local exception completely, set \`XIANSCAN_TRUST_LOOPBACK=0\`; then every request needs the token.
`,
			},
		],
	},

	'getting-started/data-and-updates': {
		title: 'Your Data, Updates & Backups',
		description: 'Where XianScan keeps your library, how to update, back up, move or remove it.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'data-location',
				title: '1. Where Your Data Lives',
				content: `
Your library, settings, database and access token are kept in one data folder, separate from the program:

| System | Data folder |
| :--- | :--- |
| **Windows** | \`%APPDATA%\\XianScan\\data\` |
| **macOS** | \`~/Library/Application Support/XianScan/data\` |
| **Linux** | \`~/.local/share/xianscan/data\` (or \`$XDG_DATA_HOME/xianscan/data\`) |
| **Docker** | \`/config/xianscan/data\` inside the \`/config\` volume |

Next to it, an \`app\` folder holds the unpacked web app. XianScan recreates it whenever needed, so you never need to back it up.

If XianScan runs as a Windows service under the SYSTEM account, its data is under \`C:\\Windows\\System32\\config\\systemprofile\\AppData\\Roaming\\XianScan\\data\` instead.
`,
			},
			{
				id: 'updating',
				title: '2. Updating',
				content: `
**Settings** -> **About & Diagnostics** -> **Check Updates** tells you when a new release is available.

- **Windows, macOS, Linux:** stop XianScan, download the new archive, and replace the old program files with the new ones. Your data folder is never touched by an update. On the next start, XianScan unpacks the new web app automatically.
- **Docker:** \`docker pull ghcr.io/arbenapura/xianscan:latest\`, then remove and recreate the container with the same \`-v xianscan-config:/config\` volume (or \`docker compose pull && docker compose up -d\`).

After updating, also update the [Browser Importer](/docs/extensions/importer) if a new version was released with it. Mihon updates its extension from the repository by itself.
`,
			},
			{
				id: 'backup',
				title: '3. Backing Up and Moving',
				content: `
1. Stop XianScan.
2. Copy the whole data folder somewhere safe.
3. To move to another computer, install XianScan there, start it once, stop it, and replace its data folder with your copy.

The copy includes the access token, so paired devices keep working if you move to a machine with the same address.
`,
			},
			{
				id: 'uninstall',
				title: '4. Removing XianScan',
				content: `
Delete the program folder, then delete the \`XianScan\` folder that contains \`data\` and \`app\` (one level above the data folder in the table). In Docker, remove the container and the \`xianscan-config\` volume.

To only start over with an empty library, use **Settings** -> **Storage & Data** -> **Clear All Data** instead.
`,
			},
		],
	},

	'getting-started/troubleshooting': {
		title: 'Troubleshooting',
		description: 'Solutions for the most common problems with starting, translating, GPUs and connecting devices.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'start-problems',
				title: '1. XianScan Does Not Start',
				content: `
- **Windows SmartScreen blocks it:** click **More info** -> **Run anyway**.
- **macOS says the app is damaged or cannot be checked:** run \`xattr -dr com.apple.quarantine .\` in the extracted folder, then start it again.
- **Linux: \`GLIBC_2.xx not found\`:** your distribution is too old for the release build. Use the Docker image, or a newer distribution (Ubuntu 24.04 or later).
- **"Address already in use":** another program (or a second XianScan) uses port 8124. Close it, or start XianScan with a different port, for example \`PORT=8200 ./xianscan\` (PowerShell: \`$env:PORT=8200; .\\xianscan.exe\`).
`,
			},
			{
				id: 'translation-problems',
				title: '2. Pages Are Cleaned but Not Translated',
				content: `
The translation model is not reachable.

- **Using Ollama (the default):** make sure Ollama is running and the model is downloaded (\`ollama list\` should show \`qwen3.5:9b\`, or whichever model you chose).
- **Using a cloud provider:** open **Settings** -> **AI Translation Providers** and click **Test Connection**. Check the API key and that your account has credit.
- **After changing a provider's Endpoint Base URL:** enter the API key again; a saved key never follows a provider to a new address.
- **A page shows an error badge:** open it in the Page Inspector and use **Re-translate Page**. The error text usually says what went wrong.
`,
			},
			{
				id: 'boxes',
				title: '3. Translated Text Shows Empty Boxes',
				content: `
No installed font covers the target language's script. XianScan warns about this in the book editor and while translating. Open **Settings** -> **Typesetting & Lettering**, then pick a font for that script's row in the **Fonts** table, or choose **Import font...** in that dropdown. See [Typography & Fonts](/docs/advanced/typography).
`,
			},
			{
				id: 'gpu-problems',
				title: '4. The GPU Is Not Used',
				content: `
Open **Settings** -> **Hardware & Compute** to see the active device.

- **Integrated graphics** are skipped on purpose; only dedicated GPUs are used.
- **Windows laptop with two GPUs:** DirectML uses the adapter Windows lists first. Set \`xianscan.exe\` to **High performance** in Windows **Settings** -> **System** -> **Display** -> **Graphics**.
- **Linux:** CUDA needs the NVIDIA driver, CUDA 13 and cuDNN 9, and the archive's \`.so\` files must stay next to the program. Follow [GPU Acceleration](/docs/advanced/gpu).
- **It worked, then fell back to CPU:** a GPU failed to start a model, so XianScan switched to the CPU. Fix the cause, then select the GPU again in **Hardware & Compute** or restart.
- **Docker** always runs on the CPU.
`,
			},
			{
				id: 'device-problems',
				title: '5. Another Device Cannot Connect',
				content: `
- **The page does not load at all:** LAN access is off, or XianScan was not restarted after turning it on. Check **Settings** -> **Network & Access**. Also check that both devices are on the same network, and that your firewall allows port 8124.
- **"Token rejected" (Browser Importer) or a 401 error (Mihon):** the token was mistyped or regenerated. Copy it again from **Network & Access**.
- **Mihon: "server address" rejected:** remove the trailing slash, for example \`http://192.168.1.20:8124\`.
`,
			},
			{
				id: 'help',
				title: '6. Still Stuck?',
				content: `
Ask on [Discord](https://discord.gg/dRWaQftNnR) or open an issue on [GitHub](https://github.com/ArbenApura/xianscan-rust/issues). Include your system, the XianScan version (**Settings** -> **About & Diagnostics**), the console output, and for a bad page the **Copy Debug** text from the Page Inspector.
`,
			},
		],
	},

	'extensions/importer': {
		title: 'Browser Importer',
		description: 'Import chapters from comic websites with one click, or translate pages right on the website.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'overview',
				title: '1. What It Does',
				content: `
The XianScan browser extension connects your browser to your XianScan server:

- **Import:** finds the comic pages on the website you are reading (including lazy-loaded and infinite-scroll readers), lets you pick them, and sends them to a book in your library. It guesses the chapter number from the page title or URL.
- **In-Place Translation (beta):** replaces the pages on the website with translated versions as they finish.
- It skips ads and banners, and if a site blocks direct downloads it fetches the images from inside the open tab instead.

![Importing a chapter with the browser extension](/showcase/extension_importer_preview.png)
`,
			},
			{
				id: 'install',
				title: '2. Install',
				content: `
Download the extension from the same [GitHub Release](https://github.com/ArbenApura/xianscan-rust/releases) as XianScan. The extension has its own version number, so the file names contain a different version than the app.

#### Chrome, Edge, Brave, Opera
1. Download \`xianscan-importer-v<version>.zip\` and extract it to a folder you will keep.
2. Open \`chrome://extensions\` (or \`edge://extensions\`, \`brave://extensions\`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the extracted folder.

#### Firefox
The Firefox package (\`xianscan-importer-firefox-v<version>.xpi\`) is not signed by Mozilla, so regular Firefox will not install it permanently.

- **Firefox (regular release):** open \`about:debugging#/runtime/this-firefox\`, click **Load Temporary Add-on...** and pick the \`.xpi\`. It stays until you restart Firefox.
- **Firefox Developer Edition, Nightly or ESR:** set \`xpinstall.signatures.required\` to \`false\` in \`about:config\`, then drag the \`.xpi\` into Firefox to install it permanently.

Firefox 109 or newer is required.
`,
			},
			{
				id: 'connect',
				title: '3. Connect It to XianScan',
				content: `
1. Click the XianScan extension icon, then the gear icon to open **Connection Settings**.
2. **XianScan Server Endpoint:** keep \`http://127.0.0.1:8124\` if XianScan runs on this computer. For another computer, enter the address shown in its **Settings** -> **Network & Access** (LAN access must be on there).
3. **Access token:** copy it from XianScan **Settings** -> **Network & Access**. The extension needs it even on the same computer. It is stored in the extension and never shared with websites.
4. Click **Save & Connect**. If you see "Token rejected", copy the token again; it may have been regenerated.
`,
			},
			{
				id: 'use',
				title: '4. Import or Translate a Chapter',
				content: `
1. Open a chapter on a comic website and scroll through it once, so lazy-loaded images appear.
2. Click the XianScan extension icon. It lists the pages it found.
3. Pick the **Target Book** and **Target Chapter** (or create new ones from the same list), and set the two options:
   - **Auto-Reslice:** re-slice webtoon strips so no speech bubble is cut in half.
   - **Auto-Translate:** start translating right after the upload.
4. Click **Import Selected Pages** (the button shows how many pages are selected).

To read the translation on the website itself, turn on **In-Place Translation**. It uploads and translates the pages, then swaps them in as each one finishes. While it is on, Auto-Translate is always on.

![In-place translation on a comic website](/showcase/extension_inline_preview.png)

*(For building the extension from source, see [Extension & Client Architecture](/docs/advanced/extensions).)*
`,
			},
		],
	},

	'extensions/mihon': {
		title: 'Mihon (Android)',
		description: 'Read your translated library on Android with the Mihon app, over your home Wi-Fi.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'overview',
				title: '1. Overview',
				content: `
The XianScan extension for [Mihon](https://mihon.app/) turns your XianScan library into a source in the Mihon reader app. Your pages stay on your computer and are streamed to the phone over your network.

- **Requires:** Android 6 or newer, and Mihon ([mihon.app/download](https://mihon.app/download/)). The extension is built for Mihon's current extension format; older apps such as the original Tachiyomi cannot load it, and other forks are not tested.
- **Tachimanga (iOS):** being tested. It uses the same repository and settings; allow the **Local Network** permission when iOS asks.

| Sources | Library | Reader |
| :--- | :--- | :--- |
| ![Mihon sources](/showcase/mihon_source_preview.jpg) | ![Mihon library](/showcase/mihon_library_preview.jpg) | ![Mihon reader](/showcase/mihon_reader_preview.jpg) |
`,
			},
			{
				id: 'install',
				title: '2. Install the Extension',
				content: `
#### Option A: Add the repository (recommended, updates automatically)

1. In Mihon, open **More** -> **Settings** -> **Browse** -> **Extension repos**.
2. Tap **Add** and paste:

\`\`\`text
https://raw.githubusercontent.com/ArbenApura/xianscan-rust/repo/index.min.json
\`\`\`

3. Go to **Browse** -> **Extensions**, find **XianScan** and tap **Install** (tap **Trust** if asked).

#### Option B: Install the APK by hand

1. Download \`tachiyomi-all.xianscan-v<version>.apk\` from the [\`repo\` branch](https://github.com/ArbenApura/xianscan-rust/tree/repo).
2. Open the file on your phone to install it, then tap **Trust** in Mihon if asked.

Use one option only. An APK built yourself is signed with a different key and cannot update over the repository version.
`,
			},
			{
				id: 'connect',
				title: '3. Connect to XianScan',
				content: `
1. On your computer, turn on LAN access in XianScan (**Settings** -> **Network & Access**) and restart it. See [Other Devices & Access Token](/docs/getting-started/network-access).
2. In Mihon, go to **Browse** -> **Extensions** and tap the gear icon next to **XianScan**, then the gear next to **Multi**.
3. Tap **Server address** and enter the computer's address with port 8124, for example \`http://192.168.1.20:8124\` (no slash at the end).
4. Tap **Access token** and paste the token from **Network & Access**.
5. In **Browse** -> **Sources**, tap the filter icon and turn on the **Multi** language, then open **XianScan**.

The computer must be on and running XianScan while you read. To read away from home, see [Cloudflare Tunnels](/docs/advanced/self-hosting#cloudflare-tunnels).
`,
			},
			{
				id: 'good-to-know',
				title: '4. Good to Know',
				content: `
- Pages that are not translated yet are shown in the original language.
- Chapters are numbered by their position in the book (1, 2, 3...), not by the chapter number in their title.
- Archived books are hidden. The **Status** filter narrows the list by publication status.
- "Popular" and "Latest" show the same list, sorted by the most recently updated book.
`,
			},
		],
	},

	'translation/models': {
		title: 'Translation Providers',
		description: 'Choose between local models (Ollama, LM Studio) and cloud APIs, and tune how translation works.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'providers-overview',
				title: '1. Available Providers',
				content: `
XianScan works with any OpenAI-compatible API. These providers are built in; the default is **Ollama** with \`qwen3.5:9b\`.

To change provider: **Settings** -> **AI Translation Providers** -> **Switch Provider**, enter the **API Key** (cloud only) and **Model**, click **Test Connection**, then **Save & Set Active**. Local providers (Ollama, LM Studio, or any \`localhost\` address) need no key.

When you change a cloud provider's **Endpoint Base URL**, enter the API key again in the same save. A saved key is never sent to a new address.
`,
			},
			{
				id: 'ollama-setup',
				title: '2. Setting Up Ollama',
				content: `
1. Install [Ollama](https://ollama.com/). On Windows and macOS it runs in the background after installing; on a Linux server, start it with \`ollama serve\`.
2. Download a model that fits your GPU:

\`\`\`bash
ollama pull qwen3.5:4b    # 4 to 6 GB of GPU memory, or CPU
ollama pull qwen3.5:9b    # 8 to 12 GB (XianScan's default)
ollama pull qwen3.5:27b   # 16 GB or more
\`\`\`

3. In XianScan, open **Settings** -> **AI Translation Providers**, choose **Ollama (Local)**, and set the **Model** to the one you downloaded. The **Endpoint Base URL** is \`http://localhost:11434/v1\`.
4. Click **Test Connection**.

**No strong GPU?** Ollama can also run models in Ollama's cloud with a free account. Run \`ollama signin\`, then \`ollama pull gemma4:cloud\`, and set the model to \`gemma4:cloud\`. Your pages are still processed locally; only the text is sent to Ollama's servers.
`,
			},
			{
				id: 'dialogue-context',
				title: '3. Dialogue Context',
				content: `
To keep names, pronouns and the flow of conversation consistent, XianScan sends the recent dialogue from previous pages along with each page. Empty pages are skipped, and at the start of a chapter it looks back into the previous chapter.

Set how many pages it looks back with **Sliding Dialogue Context** in **Settings** -> **AI Translation Providers** -> **Inference & Sampling**: **Off**, 1 to 6 pages, or **Custom**. The default is 4. More context helps consistency but makes each request longer and slower.
`,
			},
			{
				id: 'inference-parameters',
				title: '4. Reasoning, Output Length and Sampling',
				content: `
Also in **Inference & Sampling**:

- **Reasoning effort:** for models that can "think" first (DeepSeek-R1, OpenAI o-series, Qwen with thinking). Choose **None**, **Minimal**, **Low**, **Medium**, **High**, **Max** or **Auto**, or type a custom value. For Ollama it simply turns thinking on or off. The model's thinking never ends up in the speech bubbles.
- **Max output tokens:** default 4,096. XianScan raises it automatically for pages with a lot of text, and doubles it when it retries a page.
- **Temperature** (default 0.2), **Top-P**, **frequency** and **presence penalty:** lower temperature gives more literal, consistent translations. Each can be switched off to use the provider's own default.
`,
			},
		],
	},

	'translation/glossaries': {
		title: 'Glossaries & Directives',
		description: 'Keep names and terms consistent with glossaries, genre theme packs and per-book instructions.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'glossary',
				title: '1. Glossary Terms',
				content: `
A glossary tells the translator how to render a name or term, every time. Open **Glossary** in the top navigation.

- **Global Scope** terms apply to every book; **Book Scope** terms apply to one book (open it from the book page's **Glossary** button).
- **Add term:** enter the **Source term**, how it should appear in the translation (**Target rendering**), and optionally a category, gender (so pronouns come out right), aliases and a description. **Pin** makes the translator prioritise the term.
- During translation, XianScan also suggests new terms it finds. They are marked **AI** until you review them; terms you add or edit are marked **You**.
- **Import CSV** and **Export** move glossaries between books or computers.

Matching tolerates small OCR mistakes, so a term is still found when one character was misread.

Terms with the category **technique** also mark free-floating text that is exactly that term as accent text, so a recurring technique name gets the [accent font](/docs/advanced/typography#accent-font) on every page.
`,
			},
			{
				id: 'themes',
				title: '2. Genre Theme Packs',
				content: `
Theme packs are built-in term lists for common genres. All are on by default; turn them on or off under **Glossary** -> **Theme Presets**.

1. **Wuxia & Cultivation** (\`xianxia\`): cultivation realms such as Qi Condensation, Foundation Establishment, Golden Core and Nascent Soul, plus sects, meridians and alchemy.
2. **Murim & Martial Arts** (\`murim\`): martial sects and clans (Shaolin, Wudang, Mount Hua), internal energy, Qi deviation.
3. **Hunter & System** (\`system\`): hunters, gates, status windows, constellations, regressors, hunter ranks.
4. **Fantasy & Isekai** (\`fantasy\`): adventurers' guilds, demon lords, heroes, saintesses, magic circles.
5. **Romance Fantasy** (\`rofan\`): villainesses, grand dukes, crown princes, noble titles.
6. **Imperial Palace** (\`palace\`): emperors, consorts, the Cold Palace, eunuchs, court ranks.
7. **Sci-Fi & Sentinelverse** (\`scifi\`): sentinels, guides, mecha, the Zerg.

The packs are small, hand-picked lists (about 180 terms in total) meant as a starting point. Add your own terms for each series.
`,
			},
			{
				id: 'languages',
				title: '3. Languages',
				content: `
**Source languages** (what XianScan can read): Chinese (Simplified and Traditional), Japanese, Korean, English, Spanish, French, Russian, Indonesian and Thai.

**Target languages** (what it can translate into): the theme packs have terms for 20 of them: Simplified and Traditional Chinese, English, Japanese, Korean, Spanish, French, German, Russian, Portuguese, Italian, Indonesian, Turkish, Dutch, Polish, Thai, Hindi, Ukrainian, Swedish and Finnish. **Arabic** is also available as a target (drawn right to left) but has no pack terms yet. A book can also be set to **Read in original** to use XianScan without translating.
`,
			},
			{
				id: 'directives',
				title: '4. Book Directives',
				content: `
For instructions that are not single terms, click **Directives** on the book page. Write plain instructions for the translator, up to 4,000 characters, for example:

\`\`\`text
Keep cultivation ranks formal. Keep Korean honorifics like hyung and sunbae.
The main character speaks casually; elders speak formally.
\`\`\`

Directives apply to every chapter of that book.
`,
			},
		],
	},

	'advanced/gpu': {
		title: 'GPU Acceleration',
		description: 'Set up NVIDIA CUDA on Linux, and check GPU use on Windows (DirectML) and macOS (CoreML).',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'windows',
				title: '1. Windows (DirectML)',
				content: `
Nothing to install. XianScan uses DirectML (it ships its own \`DirectML.dll\`) when it finds a dedicated NVIDIA, AMD or Intel Arc GPU. Detection and cleaning run on the GPU; text recognition (OCR) runs on the CPU.

- Integrated graphics are skipped and run on the CPU.
- DirectML uses the GPU that Windows lists first. On a laptop with two GPUs, set \`xianscan.exe\` to **High performance** in Windows **Settings** -> **System** -> **Display** -> **Graphics**.
- On a fresh cloud Windows Server (AWS, Azure), the GPU shows up only after the vendor's display driver is installed. Until then, XianScan runs on the CPU.

Check what is active:

\`\`\`powershell
Invoke-RestMethod http://127.0.0.1:8124/api/system/hardware | ConvertTo-Json
\`\`\`

\`"active_provider": "DmlExecutionProvider"\` means DirectML is in use.
`,
			},
			{
				id: 'cuda-linux',
				title: '2. Linux (NVIDIA CUDA 13)',
				content: `
The Linux release uses ONNX Runtime built for **CUDA 13**, so it needs:

- the NVIDIA driver **580 or newer**,
- the **CUDA 13** runtime libraries,
- **cuDNN 9** for CUDA 13.

Older setups built for CUDA 12 (driver 550, \`nvidia-cudnn-cu12\`) are not enough; XianScan then runs on the CPU.

#### Step 1: Install the driver, CUDA 13 and cuDNN (Ubuntu 24.04)
Add NVIDIA's CUDA repository, following [NVIDIA's instructions](https://developer.nvidia.com/cuda-downloads) for your distribution, then:

\`\`\`bash
sudo apt-get update
sudo apt-get install -y nvidia-driver-580-server cuda-toolkit-13-0 cudnn9-cuda-13
sudo reboot
\`\`\`

After the reboot, \`nvidia-smi\` should list your GPU and show "CUDA Version: 13" or higher.

#### Step 2: Check that XianScan finds every library
The archive ships \`libonnxruntime_providers_cuda.so\` next to \`xianscan\`. Keep them in the same folder, then run:

\`\`\`bash
cd ~/xianscan-app    # the folder with xianscan and the .so files
ldd ./libonnxruntime_providers_cuda.so | grep "not found"
\`\`\`

No output means everything is found. If libraries are listed, add their folder to \`LD_LIBRARY_PATH\` (step 3).

#### Step 3: Start XianScan

\`\`\`bash
export LD_LIBRARY_PATH="$PWD:/usr/local/cuda/lib64:\$LD_LIBRARY_PATH"
./xianscan
\`\`\`

The startup log and **Settings** -> **Hardware & Compute** should now show CUDA and your GPU.
`,
			},
			{
				id: 'macos',
				title: '3. macOS (CoreML)',
				content: `
Nothing to install. On Apple Silicon, XianScan runs detection, OCR and cleaning through Apple's CoreML.
`,
			},
			{
				id: 'switching',
				title: '4. Choosing the Device and Memory Limit',
				content: `
**Settings** -> **Hardware & Compute** lets you pick the device (Auto, a GPU, or CPU), limit how much GPU memory XianScan may use (useful when a local LLM shares the GPU), and set how many pages and chapters are processed in parallel. Your choice is saved.

The same can be done without the UI, for scripts. A change made this way lasts until the next restart:

\`\`\`bash
# Show the active device and GPUs (no token needed on the same machine)
curl http://localhost:8124/api/system/hardware

# Switch to CUDA and cap each model at 8 GB of GPU memory
curl -X POST http://localhost:8124/api/system/hardware \\
  -H "Content-Type: application/json" \\
  -d '{"device": "cuda", "vram_limit_mb": 8192}'
\`\`\`

Valid devices are \`auto\`, \`cuda\`, \`dml\`, \`coreml\` and \`cpu\`. An unknown value is treated as \`auto\`. The memory limit only applies to CUDA. From another machine, add \`-H "Authorization: Bearer <token>"\`.
`,
			},
		],
	},

	'advanced/ml-pipeline': {
		title: 'How the Pipeline Works',
		description: 'What happens to a page: detection, OCR, translation, cleaning and typesetting, and the models behind each step.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'pipeline-stages',
				title: '1. Overview',
				content: `
XianScan has two parts that run together: a Rust engine that runs the image models (through ONNX Runtime), and a Node.js web server that runs the studio, translation and typesetting. For each page:

\`\`\`text
[Raw page]
   │
   ├─ (optional) Re-slice webtoon strips at panel gaps          engine: src/ml/reslice.rs
   ▼
1. Detect speech bubbles and text areas (RF-DETR)               engine: src/ml/detect/
2. Read the text (OCR) and put regions in reading order         engine: src/ml/ocr/, src/pipeline/
   │
   ├──────────────────────────────┐
   ▼                              ▼
3. Translate with the LLM      4. Remove the original text       web: server/translate/
   (glossary + dialogue           (LaMa inpainting)              engine: src/ml/inpaint/
    context)                      │
   └──────────────┬───────────────┘
                  ▼
5. Typeset the translation into the cleaned page                web: server/typeset/
   ▼
[Translated page]
\`\`\`

Translation and cleaning run at the same time, and typesetting starts when both are done. Re-slicing happens only before a full-chapter translation (when **Auto-Reslice Before Batch Translation** is on) or when you start it by hand.
`,
			},
			{
				id: 'detection',
				title: '2. Detection and Text Regions',
				content: `
- **Koharu RF-DETR Seg 2XL** (\`src/ml/detect/rfdetr.rs\`), a 768 px transformer detector, finds speech bubbles, captions, sound effects and panels as rectangles.
- The OCR's own text-line detector (DBNet post-processing in \`src/ml/detect/dbnet.rs\`) finds the individual text lines inside them.
- \`src/pipeline/region_builder/\` merges nearby lines into dialogue blocks, pads them so every glyph is covered, and removes duplicates.
- Clean-up rules keep dark bubbles contained, preserve the angle of tilted sound effects, drop bubble tails, repeated dashes and stray dots, and keep Latin words inside CJK text.
- Overlapping-tile detection for very tall strips (\`src/ml/detect/tiling.rs\`) exists but is **off by default** while its accuracy is reviewed.
`,
			},
			{
				id: 'ocr',
				title: '3. OCR and Reading Order',
				content: `
- **RapidOCR** (\`src/ml/ocr/engine.rs\`) reads 10 source languages: Chinese (Simplified and Traditional), Japanese, Korean, English, Spanish, French, Russian, Indonesian and Thai. Detection and most recognition use PP-OCRv6 models; Korean and Cyrillic use PaddleOCR mobile models, and Thai a PP-OCRv5 model.
- **Reading order** (\`src/ml/detect/grouping.rs\`): regions are grouped into horizontal bands from top to bottom. Within a band, Japanese reads right to left; Chinese and Korean read left to right. Vertical text inside one region is read in columns from right to left.
`,
			},
			{
				id: 'translation',
				title: '4. Translation',
				content: `
The web server (\`web/src/lib/server/translate/\`) sends the page's text to your chosen LLM together with:

- matching glossary terms (found with an Aho-Corasick matcher that tolerates small OCR errors),
- the book's directives,
- recent dialogue from previous pages (see [Dialogue Context](/docs/translation/models#dialogue-context)).

Failed or cut-off answers are retried with a larger output budget.

The model also returns a \`styles\` map that marks accent text (named techniques, attacks, spells and title cards). The labels are cached with the translation, stored per text region, and topped up by glossary terms of the category **technique**.
`,
			},
			{
				id: 'inpainting',
				title: '5. Cleaning (Inpainting)',
				content: `
- **LaMa** (\`src/ml/inpaint/lama.rs\`, a manga-tuned model) paints over the original text and rebuilds the artwork, screentones and gradients behind it.
- **White bubble clean-up:** after LaMa, confirmed white speech bubbles are wiped clean inside (removing leftover dust and smudges) while their outline is kept. On by default.
- **Inpainting Strategy** (**Settings** -> **Inpainting & Cleaning**, planned in \`src/ml/inpaint/plan.rs\`):
  - **Patch Crop** (default): cleans small patches around each text area at full resolution. Fastest and sharpest for most pages.
  - **Balanced (512 px Tiles):** cleans the page in square tiles scaled to 512 px, instead of squashing the whole page into one 512x512 pass. Better on some tall strips, but much slower on them.
  - **Full Dynamic:** cleans the whole page at native resolution up to about 2048x2048 pixels (4096 px per side); larger pages are processed in overlapping bands so memory stays bounded.
- The detector, OCR and cleaning models each have their own lock, so cleaning a page is not blocked while a long re-slice runs.
`,
			},
			{
				id: 'typesetting',
				title: '6. Typesetting',
				content: `
The web server draws the translation with Skia (\`@napi-rs/canvas\`, code in \`web/src/lib/server/typeset/\`):

- **Font size:** tries sizes from large to small until the wrapped text fits the region. (A binary search is not used, because wrapping does not shrink evenly.)
- **Line breaks:** balanced line lengths, with hyphenation for English. Hindi and other complex scripts break only between whole characters, Thai at dictionary word boundaries.
- **Arabic:** drawn right to left with Arabic punctuation (\`؟ ، ؛\`), whole words kept together.
- **Fonts:** each line uses a font that really covers its script (see [Typography & Fonts](/docs/advanced/typography)). If none does, a warning appears, because the text would show as boxes.
- **Outline and tilt:** an outline in contrast to the background, and text rotated to match tilted bubbles (2 to 45 degrees).
- **Accent text:** drawn in the accent font for its script when that font has every letter; missing symbols come from the dialogue font, and the text is centred on its measured ink. Otherwise it uses the dialogue font with one outline step heavier.
`,
			},
		],
	},

	'advanced/typography': {
		title: 'Typography & Fonts',
		description: 'Choose the dialogue and accent font for each script, import your own fonts, and adjust how text is drawn.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'dialogue-font',
				title: '1. The Fonts Table and Text Style',
				content: `
**Settings** -> **Typesetting & Lettering** -> **Fonts** is a table with one row per writing system and two columns:

- **Dialogue:** the font for speech, thoughts and captions. The **Latin** row is the font for English, Spanish, Indonesian and other Latin-script languages.
- **Accent:** the font for skill names, attacks, spells and title cards (see [Accent Font](#accent-font)). Latin starts with the bundled **Sigmar One**; other scripts start **Off**, which means accent text looks like dialogue.

Latin, the scripts your books are translated into, the scripts of the default language pair (**General & Appearance**) and any script you set a font for are listed. **Show all scripts** reveals the others: Chinese, Japanese, Korean, Cyrillic, Thai, Hindi and Arabic, the scripts of every supported language.

Below the table:

- **Dialogue Font Weight:** from 100 (Thin) to 900 (Black). XianScan uses the matching file when a family has several weights.
- **Dialogue Letterform Casing:** UPPERCASE (classic comic lettering), Normal / As Is, or lowercase.
- **Text Stroke Outline:** None, Thin, Standard or Heavy.
- **Bubble Inset Padding:** how much space to leave between text and the bubble edge.
- **Bubble Centering & Expansion:** lets text use a little more room than the detected text area, so letters are not clipped.
- **Bubble Tilt Angle:** rotate text to follow tilted bubbles.

**Live Speech Bubble Preview** shows the result as you change settings. The preview is drawn by your browser; **Render exact preview** draws it with the real typesetter so you see exactly what the pipeline will produce. Once an accent font is set, both previews also show an accent sample under the bubble.

**Live Pipeline Step Previews** is under **General & Appearance**.
`,
			},
			{
				id: 'script-fonts',
				title: '2. Fonts for Other Scripts (CJK, Hindi, Thai, Arabic, Cyrillic...)',
				content: `
Every script row in the Fonts table has its own dialogue font.

- **Automatic** (default) picks the best available font that really has the letters, and shows which font it chose. It tries your choice for that script first, then the Latin dialogue font if it covers the script, then a bundled or system font.
- **Bundled fonts** work everywhere, including Docker: Noto Sans Devanagari (Hindi), Noto Sans Thai, Tajawal (Arabic) and WenQuanYi Micro Hei (CJK).
- **System fonts** are used too when installed, for example Nirmala UI and Leelawadee UI on Windows, Kohinoor Devanagari and Thonburi on macOS, or Noto fonts on Linux.
- A **red** note under a cell means no available font covers that script, so its text would show as boxes; **amber** means the font you chose does not have those letters. The book editor and folder import warn about the target language in the same way.
`,
			},
			{
				id: 'accent-font',
				title: '3. Accent Font (Skills, Attacks and Title Cards)',
				content: `
Comics letter some text differently from speech: a cultivation technique announced over the art, a shonen attack call, a fantasy spell, a system message like \`[Skill: Shadow Step]\`, or a title card for a new arc. XianScan calls this **accent text**.

- **The translator marks it.** While translating a page, the AI also says which text regions are accent text. Ordinary speech that only mentions a technique stays dialogue. Glossary terms with the category **technique** mark matching free-floating text as accent text too.
- **Choose the font per script** in the **Accent** column of the Fonts table. Latin uses the bundled **Sigmar One** by default; pick a brush font for Chinese, for example, or another display font for Latin. Set a cell to **Off** to letter that script's accent text like dialogue; with every cell **Off**, pages look exactly as before accent fonts existed.
- **Accent casing, weight and speech bubbles:** once an accent font is set, a row under the table sets its casing and weight, and **Accent in speech bubbles** (off by default) decides whether accent text inside a speech bubble also gets the accent font.
- **Every letter must be in the font.** An accent font is used for a region only when it has every letter of that text. Many display fonts have no accented letters, so French \`É\` or Spanish \`Ñ\` makes that region fall back to the dialogue font with a slightly heavier outline. The Accent cell lists the common letters a font lacks.
- **Symbols:** brackets, dashes and similar marks missing from the accent font are drawn in the dialogue font, so \`[Skill: ...]\` keeps its brackets.
- **System fonts on Linux, Docker and macOS user fonts:** XianScan cannot always read which letters these fonts have, and the Accent cell says so. Import the font file to get the letter check.
- **Fix a region by hand:** in the Page Inspector, accent regions show an **Accent** badge. Open a region and switch **Lettering** between **Dialogue** and **Accent**. Re-translating the page resets these switches, like manual text edits.
`,
			},
			{
				id: 'custom-fonts',
				title: '4. Importing and Removing Fonts',
				content: `
Every dropdown in the Fonts table ends with two commands. The font you add goes straight into the cell you opened it from.

- **Import font...:** add \`.ttf\` and \`.otf\` files. XianScan reads each font and shows which scripts it covers. It also warns about old Hindi fonts that use a legacy encoding and would print the wrong letters. You can add several weights (Regular, Bold and so on) to one family.
- **Add system font...:** use a font that is already installed on your computer. XianScan looks in the standard font folders: \`C:\\Windows\\Fonts\` and your user fonts folder on Windows, \`/System/Library/Fonts\` and \`/Library/Fonts\` on macOS, and \`/usr/share/fonts\` and \`/usr/local/share/fonts\` on Linux.

Fonts you added are listed under the table as **Your fonts**. The **x** on a chip deletes an imported font or removes a system font from the choices; cells that used it go back to the default dialogue font, **Automatic** or **Off**.
`,
			},
			{
				id: 'accent-font-sources',
				title: '5. Getting Accent Fonts',
				content: `
XianScan ships one accent font, **Sigmar One** (SIL Open Font License), the default for Latin. It has every accented letter the supported Latin languages use, so French, Spanish, German, Polish or Turkish accent text stays in the accent font. For other scripts, or another Latin look, the **Free accent fonts** link above the Fonts table lists more free fonts under the same licence, for example Bangers (Latin), Zhi Mang Xing and Ma Shan Zheng (Chinese brush), Yuji Boku (Japanese), Black Han Sans (Korean), Rozha One (Hindi), Kanit (Thai), Lalezar (Arabic) and Russo One (Russian). Download one from its page, then choose **Import font...** in an Accent cell.

Freeware comic fonts, such as many Blambot fonts, are fine to import for your own reading, but their licences usually forbid sharing them. XianScan never bundles or uploads a font you import.
`,
			},
		],
	},

	'advanced/storage': {
		title: 'Storage & Cleanup',
		description: 'See how much disk space your library uses and free up space.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'overview',
				title: '1. Storage Overview',
				content: `
**Settings** -> **Storage & Data** shows how much space each kind of file uses: raw scans, cleaned pages, translated pages, OCR previews, book covers, page thumbnails, the database and the translation cache. Click **Refresh** to measure again.

Your files are in the data folder described in [Your Data & Updates](/docs/getting-started/data-and-updates).
`,
			},
			{
				id: 'cleanup',
				title: '2. Freeing Space',
				content: `
- **Clear Thumbnail Caches:** deletes thumbnails, cover previews and the translation cache. They are rebuilt when needed.
- **Purge Orphaned Files:** finds and deletes files that no page or book refers to any more, for example after an interrupted upload.
- **Clear All Data:** deletes your whole library and settings. This cannot be undone.

For a single book, open the book menu -> **Storage & Files** to see its size and clear its thumbnails.

Deleting a book, chapter or page also deletes its image files from disk.
`,
			},
		],
	},

	'advanced/configuration': {
		title: 'Configuration Reference',
		description: 'Command-line flags and environment variables for running XianScan on servers and in scripts.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'flags',
				title: '1. Command-Line Flags',
				content: `
| Flag | What it does |
| :--- | :--- |
| \`--lan\` | Accept connections from other devices (they need the access token). Overrides the setting in the app. |
| \`--print-token\` | Print the access token and exit. |
| \`--extract-only\` | Unpack the web app and exit (used when building the Docker image). |
| \`--ml-only\`, \`-m\` | Run only the engine, without the web studio (for development). |
| \`--dev\`, \`-d\` | Development mode (for working on XianScan itself). |
`,
			},
			{
				id: 'env',
				title: '2. Environment Variables',
				content: `
Most people never need these; everything else is in **Settings**.

#### Network and access
| Variable | Default | What it does |
| :--- | :--- | :--- |
| \`PORT\` | \`8124\` | Port of the web studio. |
| \`XIANSCAN_BIND\` | not set | \`lan\` or \`local\`. Overrides the LAN setting in the app. |
| \`XIANSCAN_TRUST_LOOPBACK\` | on | Set to \`0\` so that even requests from the same machine need the token. |
| \`ML_PORT\` | \`8123\` | Internal engine port (loopback only). |

#### Storage
| Variable | Default | What it does |
| :--- | :--- | :--- |
| \`XDG_DATA_HOME\` (Linux) | \`~/.local/share\` | Moves the whole XianScan folder, including the database and token. This is the right way to move data on Linux. |
| \`DATABASE_PATH\` | \`<data>/xianscan.db\` | Location of the SQLite database only. |
| \`DATA_ROOT\` | \`<data>\` | Location of images and fonts only. The database and access token stay in the data folder, so prefer \`XDG_DATA_HOME\`. |
| \`XIANSCAN_APP_DIR\` | \`<XianScan>/app\` | Where the web app is unpacked. |

#### Hardware and performance
| Variable | Default | What it does |
| :--- | :--- | :--- |
| \`MT_DEVICE\` | not set | Force \`cpu\`, \`cuda\`, \`dml\` or \`coreml\` while the device setting is Auto. |
| \`ONNX_THREADS\` | CPU cores, at most 8 | CPU threads per model. Raise it on large servers. |
| \`ONNX_GPU_THREADS\` | CPU cores, at most 4 | CPU threads that feed a GPU model. |
| \`ORT_CUDA_MEM_LIMIT_MB\` | automatic | GPU memory limit per model (CUDA). The limit set in the app wins. |
| \`PIPELINE_PAGE_CONCURRENCY\` | \`3\` | Pages processed in parallel within a chapter. |

#### Limits and logging
| Variable | Default | What it does |
| :--- | :--- | :--- |
| \`XIANSCAN_MAX_IMAGE_MP\` | \`100\` | Largest accepted image, in megapixels. |
| \`XIANSCAN_MAX_RESLICE_MP\` | \`200\` | Largest re-slice canvas, in megapixels. |
| \`RUST_LOG\` | \`info\` | Engine log level (\`debug\`, \`warn\`...). |
| \`LOG_REQUESTS\` | off | Set to \`1\` to log every web request. |
`,
			},
		],
	},

	'advanced/api': {
		title: 'REST API',
		description: 'The HTTP API behind the studio, for scripts and automation.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'basics',
				title: '1. Basics',
				content: `
The studio talks to its server through a JSON API at \`http://localhost:8124/api\`. You can use it for scripts, but it is the app's own API, not a stable public one: routes and fields can change between releases.

**Authentication:** requests from the same machine (to \`localhost\`, \`127.0.0.1\` or \`[::1]\`, without proxy headers) need nothing. Everything else sends the [access token](/docs/getting-started/network-access) as \`Authorization: Bearer <token>\` or \`X-XianScan-Token: <token>\`. Cross-origin (CORS) access is only granted to browser extensions.

\`\`\`bash
curl -H "Authorization: Bearer $XIANSCAN_TOKEN" http://192.168.1.20:8124/api/books
\`\`\`
`,
			},
			{
				id: 'library',
				title: '2. Library',
				content: `
| Method & Route | Description |
| :--- | :--- |
| \`GET /api/books\` | List books |
| \`POST /api/books\` | Create a book |
| \`GET\`, \`PATCH\`, \`DELETE /api/books/:id\` | Read, edit or delete a book |
| \`POST /api/books/:id/chapters\` | Create a chapter |
| \`POST /api/books/:id/chapters/reorder\` | Change chapter order |
| \`POST\`, \`DELETE /api/books/:id/clear-progress\` | Reset translations of the whole book |
| \`GET\`, \`PATCH\`, \`DELETE /api/chapters/:id\` | Read, edit or delete a chapter |
| \`POST /api/chapters/:id/pages\` | Upload page images (\`multipart/form-data\`) |
| \`POST /api/chapters/:id/pages/reorder\` | Change page order |
| \`POST /api/chapters/:id/reslice\` | Re-slice the chapter |
| \`GET /api/chapters/:id/download\` | Chapter ZIP. Pages that could not be included are listed in \`MISSING_PAGES.txt\` and the \`x-missing-pages\` header |
| \`GET\`, \`PATCH\`, \`DELETE /api/pages/:id\` | Read, edit or delete a page |
| \`GET /api/pages/:id/file?kind=output\` | Page image: \`output\`, \`cleaned\`, \`original\`, \`thumb\` or \`annotated\` |
| \`PATCH /api/pages/:id/regions/:regionId\` | Edit one text region's translation or its lettering (\`role\`: \`dialogue\` or \`accent\`) |
| \`GET /api/covers/:bookId/file?w=512\` | Book cover, resized (80 to 1600 px) |
`,
			},
			{
				id: 'translation',
				title: '3. Translation',
				content: `
| Method & Route | Description |
| :--- | :--- |
| \`POST /api/chapters/:id/translate\` | Translate a chapter |
| \`GET /api/chapters/:id/translate\` | Progress as a server-sent event stream (404 when nothing is running) |
| \`DELETE /api/chapters/:id/translate\` | Cancel |
| \`POST /api/pages/:id/translate\` | Translate one page |
| \`POST /api/pages/:id/typeset\` | Redraw one page's text |
| \`POST /api/pages/:id/reset\` | Clear one page's progress |
| \`GET\`, \`POST\`, \`DELETE /api/batch\` | Queue state, add chapters, clear |
| \`POST /api/batch/:action\` | \`pause\`, \`resume\`, \`skip\`, \`cancel\`, \`clear\` or \`remove\` |
| \`GET /api/batch/events\` | Queue updates as an event stream |
| \`POST /api/translate-text\` | Translate a piece of text with the active provider |
| \`GET\`, \`POST\`, \`PATCH /api/glossary\` | List, add or bulk-edit glossary terms |
| \`PUT\`, \`DELETE /api/glossary/:id\` | Edit or delete one term |
| \`POST /api/glossary/import\`, \`GET /api/glossary/export\` | CSV import and export |
| \`GET\`, \`POST /api/glossary/packs\` | List theme packs, choose which are on |
`,
			},
			{
				id: 'system',
				title: '4. Settings and System',
				content: `
| Method & Route | Description |
| :--- | :--- |
| \`GET\`, \`PATCH /api/settings\` | Read or change settings |
| \`GET\`, \`POST /api/system/providers\` | Translation providers; \`/models\` lists a provider's models, \`/test\` tests it |
| \`GET\`, \`POST /api/system/hardware\` | Active device and GPUs; switch device (see [GPU Acceleration](/docs/advanced/gpu#switching)) |
| \`GET /api/system/telemetry\` | CPU, memory, GPU use and running jobs |
| \`GET /api/system/version\` | Installed version and latest release |
| \`GET\`, \`POST /api/system/storage\` | Disk usage; actions \`purge-orphaned\`, \`clear-cache\`, \`clear-all\` |
| \`GET\`, \`POST /api/books/:id/storage\` | A book's disk usage; action \`prune-cache\` clears its thumbnails |
| \`GET\`, \`POST /api/system/fonts\` | List or upload fonts (\`.ttf\`, \`.otf\`) |
| \`GET\`, \`DELETE /api/system/fonts/:id\` | Read or remove an imported font |
| \`POST /api/system/fonts/:id/variants\`, \`DELETE /api/system/fonts/:id/variants/:variantId\` | Add or remove a weight |
| \`GET /api/system/fonts/system\` | Fonts installed on the computer |
| \`GET /api/system/fonts/coverage\` | Which font is used for each script, and the letters each accent font lacks (\`accent\`) |
| \`GET /api/system/fonts/book-scripts\` | Scripts your books are typeset in |
| \`POST /api/typeset/preview\` | Render an exact typesetting preview (optional \`accentText\` adds an accent sample) |
| \`GET\`, \`PATCH /api/system/access\` | LAN state, token and addresses; turn LAN on or off (after a restart) |
| \`POST /api/system/access/token/regenerate\` | Replace the access token |
| \`POST /api/auth/unlock\`, \`GET /api/auth/status\`, \`POST /api/auth/logout\` | Browser session |
| \`GET /api/mihon/*\` | Routes for the Mihon extension (see [Extension Architecture](/docs/advanced/extensions#mihon-protocol)) |
`,
			},
			{
				id: 'engine-api',
				title: '5. Internal Engine API (port 8123)',
				content: `
The Rust engine has its own API on \`127.0.0.1:8123\`, used only by the web server. It refuses browser requests and needs a per-run secret header, so you cannot and should not call it directly; use the web API above.

Its limits also apply to everything you upload: each image up to 100 megapixels and 65,535 px per side, a re-slice up to 400 images and a 200-megapixel canvas. Oversized requests are answered with \`413\`, undecodable or oversized images with \`422\`.
`,
			},
		],
	},

	'advanced/extensions': {
		title: 'Extension & Client Architecture',
		description: 'How the Browser Importer and the Mihon extension are built, and the server routes they use.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'importer-architecture',
				title: '1. Browser Importer',
				content: `
The importer (\`extensions/xianscan-importer\`) is a Manifest V3 extension written in TypeScript and bundled with esbuild. \`build.js\` produces two packages:

- \`dist/\` for Chromium browsers, with a background service worker.
- \`dist-firefox/\` for Firefox, with a background script and the add-on id \`importer@xianscan.local\`.

**Page scanner** (\`src/content/scanner.ts\`) collects images in four passes:

1. \`<img>\` elements, reading lazy-load attributes (\`data-src\`, \`data-original\`, \`data-lazy-src\`, \`data-url\` and similar), then \`srcset\`, \`currentSrc\` and \`src\`.
2. CSS \`background-image\` on page containers.
3. When fewer than 3 images are in the page, image URLs found in embedded JSON state scripts.
4. For virtual-scrolling readers, a MutationObserver remembers every image URL that appears, and matches them to empty page placeholders.

**Downloads** go through the background script. If a site refuses, the image is fetched from inside the open tab (with the page's cookies), and as a last resort drawn from the page onto a canvas. The access token is only added by the background script and never exposed to web pages.

\`\`\`bash
cd extensions/xianscan-importer
yarn install
yarn build      # dist/ and dist-firefox/
yarn package    # the .zip and .xpi release files
\`\`\`
`,
			},
			{
				id: 'mihon-protocol',
				title: '2. Mihon Extension',
				content: `
The Mihon extension (\`extensions/xianscan-mihon\`, package \`eu.kanade.tachiyomi.extension.all.xianscan\`) targets extension library 1.6 and Android 6+. It sends the access token in an \`X-XianScan-Token\` header, only to the configured server, and shows a readable message on \`401\`.

| Endpoint | Purpose |
| :--- | :--- |
| \`GET /api/mihon/library?page=N&status=&genre=\` | Books, most recently updated first, 50 per page, archived books excluded |
| \`GET /api/mihon/search?q=&page=N&status=&genre=\` | Same list, filtered by title, author or artist |
| \`GET /api/mihon/genres\` | \`{ genres: string[] }\` |
| \`GET /api/mihon/manga/<id>\` | Book details and cover URL |
| \`GET /api/mihon/manga/<id>/chapters\` | Chapter list (chapter number is the position in the book) |
| \`GET /api/mihon/chapters/<id>/pages\` | Page image URLs (\`/api/pages/<id>/file\`, translated output or the original) |
| \`GET /api/covers/<id>/file?w=512\` | Cover image |

\`\`\`bash
cd extensions/xianscan-mihon

# Debug APK (JDK 21, Android SDK platform 34, build-tools 34.0.0)
./gradlew :app:assembleDebug

# Release APK. Without signing.properties or the SIGNING_* variables it is signed
# with the debug key, and cannot update over the repository version.
./gradlew :app:assembleRelease

# Check that the APK bundles no Kotlin stdlib or host library (needs dexdump)
bash scripts/verify-apk.sh
\`\`\`

Gradle names the APK \`tachiyomi-all.xianscan-v<version>-<buildType>.apk\`. Every dependency is \`compileOnly\`, because the host app provides Kotlin and all libraries.
`,
			},
		],
	},

	'advanced/self-hosting': {
		title: 'Remote Server & Docker',
		description: 'Run XianScan on a server or NAS with Docker or systemd, and reach it safely from anywhere with a Cloudflare Tunnel.',
		lastUpdated: '2026-09-26',
		sections: [
			{
				id: 'docker-deployment',
				title: '1. Docker',
				content: `
The image runs on any Linux x86_64 host, including NAS systems such as Unraid, TrueNAS and Synology. It uses the CPU only; for a GPU, use the native binary with systemd (section 2).

#### Docker Compose
\`\`\`yaml
services:
  xianscan:
    image: ghcr.io/arbenapura/xianscan:latest
    container_name: xianscan
    restart: unless-stopped
    ports:
      - "8124:8124"
    volumes:
      - xianscan-config:/config

volumes:
  xianscan-config:
\`\`\`

Start it with \`docker compose up -d\`. Your library, settings and caches are kept in the volume under \`/config\`.

#### Access token
A container is always in LAN mode, and its connections do not come from loopback, so **every** browser (including one on the Docker host), Mihon and the importer need the token once:

\`\`\`bash
docker exec xianscan /app/xianscan --print-token
\`\`\`

To make it reachable from the host only, publish the port on loopback: \`"127.0.0.1:8124:8124"\`.
`,
			},
			{
				id: 'systemd',
				title: '2. Linux systemd Service',
				content: `
Put the extracted release in \`/home/ubuntu/xianscan\`, then create \`/etc/systemd/system/xianscan.service\`:

\`\`\`ini
[Unit]
Description=XianScan
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/xianscan
ExecStart=/home/ubuntu/xianscan/xianscan
Restart=always
RestartSec=5
Environment=PORT=8124
# For an NVIDIA GPU: folders that hold the CUDA 13 and cuDNN libraries
Environment=LD_LIBRARY_PATH=/home/ubuntu/xianscan:/usr/local/cuda/lib64

[Install]
WantedBy=multi-user.target
\`\`\`

\`\`\`bash
sudo systemctl daemon-reload
sudo systemctl enable --now xianscan
sudo -u ubuntu /home/ubuntu/xianscan/xianscan --print-token   # the token, if needed
\`\`\`

XianScan listens on loopback only, which is what you want behind a Cloudflare Tunnel (section 4). For devices on your network to connect directly, add \`--lan\` to \`ExecStart\`. Data is stored in the service user's \`~/.local/share/xianscan/data\`; to put it elsewhere, set \`Environment=XDG_DATA_HOME=/srv/xianscan\`.

For GPU setup, see [GPU Acceleration](/docs/advanced/gpu#cuda-linux).
`,
			},
			{
				id: 'windows-scheduled-task',
				title: '3. Windows Server (Runs at Startup)',
				content: `
Register XianScan as a scheduled task under the \`SYSTEM\` account, so it runs at boot and survives logging off:

\`\`\`powershell
# 1. Allow the web port through the firewall (port 8123 is internal and must stay closed)
New-NetFirewallRule -Name "XianScan-Web-8124" -DisplayName "XianScan" -Protocol TCP -LocalPort 8124 -Action Allow -Profile Any

# 2. Start XianScan at boot, with LAN access
$action = New-ScheduledTaskAction -Execute "C:\\xianscan\\xianscan.exe" -Argument "--lan" -WorkingDirectory "C:\\xianscan"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "XianScan" -Action $action -Trigger $trigger -Principal $principal -Force
Start-ScheduledTask -TaskName "XianScan"
\`\`\`

The task runs as \`SYSTEM\`, so its data and token live in the SYSTEM profile, not yours: \`xianscan.exe --print-token\` run as Administrator prints a different token. Read the service's token from \`C:\\Windows\\System32\\config\\systemprofile\\AppData\\Roaming\\XianScan\\data\\access-token\`, or open **Settings** -> **Network & Access** in a browser on the server.
`,
			},
			{
				id: 'cloudflare-tunnels',
				title: '4. Cloudflare Tunnel (Access From Anywhere)',
				content: `
A tunnel gives XianScan an HTTPS address without opening ports on your router. It also puts XianScan on the internet, so protect it with Cloudflare Access (step 5) before you share the address.

1. Install \`cloudflared\` on the server ([instructions](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)).
2. Log in and create a tunnel:

\`\`\`bash
cloudflared tunnel login
cloudflared tunnel create xianscan
\`\`\`

3. Route your hostname to XianScan in \`~/.cloudflared/config.yml\`:

\`\`\`yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/ubuntu/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: manga.yourdomain.com
    service: http://localhost:8124
  - service: http_status:404
\`\`\`

4. Run the tunnel as a service:

\`\`\`bash
cloudflared tunnel route dns xianscan manga.yourdomain.com
sudo cloudflared service install
sudo systemctl start cloudflared
\`\`\`

5. **Required: protect the hostname with Cloudflare Access.** In Cloudflare Zero Trust, create an Access application for \`manga.yourdomain.com\` with a policy that only lets you in. XianScan still asks each new browser for the access token once, because tunnel traffic is never treated as local.

Mihon cannot complete an interactive Cloudflare login. Give it a way through Access (for example a bypass rule for \`/api/mihon/*\` and \`/api/pages/*\` and \`/api/covers/*\`), and keep the XianScan access token set in the extension, which still protects those routes.
`,
			},
		],
	},
};
