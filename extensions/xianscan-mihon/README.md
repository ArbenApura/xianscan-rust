# XianScan Mihon / Tachiyomi Extension

A self-hosted **Mihon / Tachiyomi** extension that reads your **XianScan** library (including dedicated covers, description, author/artist, genres/tags, and serialization status) straight from the web server (`http://<host>:8124`).

## Install (APK from file)

1. Build: `.\gradlew.bat :app:assembleDebug` (Android SDK + JDK 17 required).
2. Copy `app/build/outputs/apk/debug/app-debug.apk` to your phone.
3. Mihon -> **Browse -> Extensions -> ⚙ (top-right) -> Install from files** -> pick the APK.
4. Go to **Browse -> Extensions** -> tap **⚙** next to **XianScan** -> tap **⚙** again next to **"Multi"** -> set **Server address** to `http://<your-pc-lan-ip>:8124` (no trailing slash). Tap OK.
5. Browse -> **Sources** -> **XianScan** -> the whole library is there with covers and metadata.

## What the server must expose

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
7. Ensure **"All"** (multi-language) is checked in the **Browse -> Sources** filter (globe 🌐 icon).

---

## Method 2: Manual APK Installation

1. Build signed release: `.\gradlew.bat :app:assembleRelease` (or grab the APK from the `repo` branch).
2. Copy `app/build/outputs/apk/release/tachiyomi-all.xianscan-v1.6.1-release.apk` to your phone.
3. In Mihon: **Browse -> Extensions -> ⚙ (top-right) -> Install from files** -> select the APK.
4. If marked untrusted, tap **Trust**.
5. Configure the server IP under **Browse -> Extensions -> XianScan (⚙) -> "Multi" (⚙) -> Server address**.

