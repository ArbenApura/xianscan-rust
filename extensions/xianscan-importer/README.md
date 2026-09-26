<div align="center">

<img src="public/icons/xianscan.svg" width="80" height="80" alt="XianScan Importer Seal" />

# XianScan Web Importer Extension

| 🌐 1. 1-Click Capture on Web Comic Site | ⚡ 2. Instant Live Translation Pipeline in Studio |
| :---: | :---: |
| <img src="../../docs/showcase/extension_importer_preview.png" width="370" alt="1-Click Browser Extension Capture" style="border-radius: 8px;" /> | <img src="../../docs/showcase/extension_pipeline_preview.png" width="490" alt="Auto-Translation Triggered After Import" style="border-radius: 8px;" /> |

</div>

<br/>

A cross-browser Manifest V3 extension for 1-click chapter and manga panel importing into your self-hosted **XianScan** backend (`http://localhost:8124`). Works natively on **Chrome, Firefox, Edge, Brave, and Opera**. It needs the XianScan access token, even on the same computer (see [Connecting to XianScan](#connecting-to-xianscan)).

## Features
- **In-Place Live Translation**: Replaces raw comic panels directly on the host website in real-time as background translation finishes, with smooth transitions, darkened pending states, and floating status badges.
- **1-Click Smart Chapter Presets**: Automatically detects chapter numbering from URL queries (`?no=19`, `?episodeNo=19`) and subtitles, falling back to sequence-based creation (`Chapter 2 (NEW)`) for instant 1-click import.
- **Intelligent Ad & Noise Shield**: Automatically filters out floating banners, promo overlays, external click-trackers, and extreme aspect ratio banner ads (`880×99`).
- **Selective Exclusion Protection**: Any image manually deselected in the gallery grid is completely protected from in-place replacement on the host webpage.
- **Private Network Safe**: In-memory Base64 IPC streaming prevents browser Private Network Access (PNA) permission prompts on HTTPS origins. Images from a XianScan server on another machine are always fetched by the extension background with the token, never loaded directly by the page.
- **4-Tier Smart Reader Scanner**: Automatically extracts full-resolution comic panels from DOM lazy attributes, JSON state trees, and virtual-scrolling readers.
- **Fast Scan**: Auto-scrolls progressive webtoon strips to trigger lazy-loads within 1.5 seconds.
- **Session-Preserving Background Streamer**: Downloads images using active tab cookies and referrer headers to bypass Cloudflare and hotlink protections.
- **Pure Typography Badge & Vector UI**: Ink & Cinnabar theme with custom selects, dialogs, and SVG vector graphics.

## Development & Build

Always use **Yarn** for managing dependencies and builds:

```bash
# Install dependencies
yarn install

# Run tests
yarn test

# Build extension into dist/
yarn build

# Watch mode
yarn watch

# Package distribution files (ZIP for Chrome Store & XPI for Firefox AMO)
yarn package
```

## Connecting to XianScan
1. Click the XianScan icon, then the settings (gear) button.
2. **Server endpoint**: `http://127.0.0.1:8124` on the same computer, or the LAN address shown in XianScan **Settings -> Network & Access** (LAN access must be turned on there first).
3. **Access token**: copy it from XianScan **Settings -> Network & Access** and paste it here. It stays in the extension background and popup; it is never given to web pages.
4. Click **Save & Connect**. "Token rejected" means the token was mistyped or regenerated.

## Loading into Chrome / Edge / Brave
1. Open `chrome://extensions/` (or `edge://extensions/` / `brave://extensions/`).
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extensions/xianscan-importer/dist` directory.
5. Click the XianScan icon in your toolbar when viewing any comic reader page!

## Loading into Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `extensions/xianscan-importer/dist-firefox/manifest.json` (or the packaged `store/xianscan-importer-firefox-v<version>.xpi` from `yarn package`).
4. The **XianScan Importer** is now active in Firefox!
