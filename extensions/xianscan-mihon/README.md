# XianScan Mihon / Tachiyomi Extension

A self-hosted **Mihon / Tachiyomi** extension that reads your **XianScan** library (including dedicated covers, description, author/artist, genres/tags, and serialization status) straight from the web server (`http://<host>:8124`).

## Before You Start: Allow Your Phone to Connect

XianScan only accepts connections from its own computer by default. On the PC running XianScan:

1. Open **Settings -> Network & Access**, turn on **LAN access**, and restart XianScan (or start it with `xianscan --lan`).
2. Copy the **access token** from the same section (or run `xianscan --print-token`). The extension needs it; without it every request is rejected.

## Install (APK from file)

1. Build: `.\gradlew.bat :app:assembleDebug` (JDK 21, as CI uses, plus Android SDK platform 34 and build-tools 34.0.0).
2. Copy `app/build/outputs/apk/debug/tachiyomi-all.xianscan-v<version>-debug.apk` to your phone.
3. Mihon -> **Browse -> Extensions -> ⚙ (top-right) -> Install from files** -> pick the APK.
4. Go to **Browse -> Extensions** -> tap **⚙** next to **XianScan** -> tap **⚙** again next to **"Multi"** -> set **Server address** to `http://<your-pc-lan-ip>:8124` (no trailing slash). Tap OK.
5. In the same screen, tap **Access token** and paste the token from XianScan. The summary then shows **Set**.
6. Browse -> **Sources** -> **XianScan** -> the whole library is there with covers and metadata.

## What the server must expose

The extension sends the access token in an `X-XianScan-Token` header, only to the configured server address. A `401` answer is shown as "XianScan rejected the access token" (copy the token again, for example after it was regenerated).

| Endpoint | Purpose |
|---|---|
| `GET /api/mihon/library?page=N&status=&genre=` | Recent-first library (SManga list) |
| `GET /api/mihon/search?q=&status=&genre=&page=N` | Search |
| `GET /api/mihon/manga/<id>` | Detail (description/author/artist/genre/status/cover) |
| `GET /api/mihon/manga/<id>/chapters` | Chapter list |
| `GET /api/mihon/chapters/<id>/pages` | Page image URLs |
| `GET /api/mihon/genres` | Distinct genres/tags (for future filters) |
| `GET /api/covers/<id>/file?w=512` | Cover thumbnails (dedicated cover or first-page fallback) |

## Method 1: Mihon Extension Repository (Recommended)

Add the XianScan Extension Repository directly in Mihon for 1-click in-app installs and updates:

1. In Mihon, open **Settings -> Browse -> Extension repos / Extension stores -> Add**.
2. Paste the repository URL:
   ```
   https://raw.githubusercontent.com/ArbenApura/xianscan-rust/repo/index.min.json
   ```
3. Tap **Add**.
4. Go to **Browse -> Extensions** (or **Extension Store**) -> find **XianScan** and tap **Install**.
5. If prompted with an **"Untrusted"** label, tap **Trust**.
6. In **Browse -> Extensions**, tap **⚙ (Settings)** next to **XianScan** -> tap **⚙** again next to **"Multi"** -> set **Server address** to your PC's local LAN address:
   ```
   http://<your-pc-lan-ip>:8124
   ```
   *(e.g. `http://192.168.1.50:8124`, no trailing slash).*
7. Tap **Access token** and paste the token from XianScan **Settings -> Network & Access**.
8. In **Browse -> Sources**, tap the filter icon and enable the **Multi** language tag.

---

## Method 2: Manual APK Installation

1. Build signed release: `.\gradlew.bat :app:assembleRelease` (or grab the APK from the `repo` branch).
2. Copy the APK under `app/build/outputs/apk/release/` (`tachiyomi-all.xianscan-v<version>-release.apk`) to your phone.
3. In Mihon: **Browse -> Extensions -> ⚙ (top-right) -> Install from files** -> select the APK.
4. If marked untrusted, tap **Trust**.
5. Configure the server IP under **Browse -> Extensions -> XianScan (⚙) -> "Multi" (⚙) -> Server address**, and paste the token under **Access token** in the same screen.

---

## Tachimanga (iOS)

Status: being tested (see the Tachimanga compatibility issue). Add the same repository URL as in Method 1:

```
https://raw.githubusercontent.com/ArbenApura/xianscan-rust/repo/index.min.json
```

Then set the extension's **Server address** to `http://<your-pc-lan-ip>:8124` and its **Access token** exactly as for Mihon (LAN access must be on in XianScan). iOS may ask for **Local Network** permission the first time; allow it, or the extension cannot reach your PC.

## Building

The extension must not bundle the Kotlin stdlib or any library the host app provides: every dependency is `compileOnly`. After `:app:assembleRelease`, `bash scripts/verify-apk.sh` checks this (it needs `dexdump` from the Android build-tools). CI runs the same check and derives the repository index from the build with `scripts/build-repo-index.py`.
