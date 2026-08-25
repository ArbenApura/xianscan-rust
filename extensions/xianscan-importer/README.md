<div align="center">

<img src="public/icons/xianscan.svg" width="80" height="80" alt="XianScan Importer Seal" />

# XianScan Web Importer Extension

| 🌐 1. 1-Click Capture on Web Comic Site | ⚡ 2. Instant Live Translation Pipeline in Studio |
| :---: | :---: |
| <img src="../../docs/showcase/extension_importer_preview.png" width="370" alt="1-Click Browser Extension Capture" style="border-radius: 8px;" /> | <img src="../../docs/showcase/extension_pipeline_preview.png" width="490" alt="Auto-Translation Triggered After Import" style="border-radius: 8px;" /> |

</div>

<br/>

A cross-browser Manifest V3 extension for 1-click chapter and manga panel importing into your self-hosted **XianScan** backend (`http://localhost:8124`). Works natively on **Chrome, Firefox, Edge, Brave, and Opera**.

## Features
- **4-Tier Smart Reader Scanner**: Automatically extracts full-resolution comic panels from DOM lazy attributes, JSON state trees, and virtual-scrolling readers.
- **⚡ Fast Scan**: Auto-scrolls progressive webtoon strips to trigger lazy-loads within 1.5 seconds.
- **Selective Batch Uploader**: Visual thumbnail grid with master select-all checkbox.
- **Session-Preserving Background Streamer**: Downloads images using active tab cookies and referrer headers to bypass Cloudflare and hotlink protections.
- **Right-Click Instant Import**: Quick-send single panels directly into your current chapter or today's Quick Inbox.
- **Auto-Translate Trigger**: Automatically kicks off ML bubble detection, OCR, and AI translation after upload.
- **Pure Vector UI**: Ink & Cinnabar theme with custom selects, dialogs, and SVG vector graphics.

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

## Loading into Chrome / Edge / Brave
1. Open `chrome://extensions/` (or `edge://extensions/` / `brave://extensions/`).
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extensions/xianscan-importer/dist` directory.
5. Click the XianScan icon in your toolbar when viewing any comic reader page!

## Loading into Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `extensions/xianscan-importer/dist/manifest.json` (or `store/xianscan-importer-firefox-v1.0.0.xpi`).
4. The **XianScan Importer** is now active in Firefox!
