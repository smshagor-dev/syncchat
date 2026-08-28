# SyncChat Desktop

SyncChat Desktop is the native desktop distribution of SyncChat. It uses **Rust + Tauri 2** for the native shell and bundles the existing production Web client locally, so Windows, macOS, Linux and browser Web stay aligned instead of maintaining separate desktop UI implementations.

## Architecture

```text
SyncChat Desktop
├── Rust / Tauri native shell
│   ├── native window lifecycle
│   ├── system tray + minimize-to-tray
│   ├── single-instance enforcement
│   ├── syncchat:// deep links
│   ├── native notifications capability
│   ├── autostart capability
│   └── external URL opener
├── Bundled SyncChat Web UI
│   └── generated from ../frontend/client/public
└── Production services
    ├── https://api.syncchat.live/api
    ├── https://api.syncchat.live
    └── https://syncchat.live
```

The user does **not** need Node.js or a local web server after installation. The frontend assets are bundled with the native application.

## Installer outputs

### Windows x64

- NSIS setup `.exe`
- MSI `.msi`
- Native `.exe`

### macOS Universal

- Drag-to-Applications `.dmg`
- `.app` bundle archive
- One universal application supports both **Apple Silicon (arm64)** and **Intel (x86_64)** Macs.

CI uses an ad-hoc macOS signature when Apple Developer signing secrets are not configured. This makes the build testable and installable for development/distribution testing, but public distribution without Gatekeeper warnings requires a Developer ID Application certificate and Apple notarization.

### Linux x86_64

- Debian/Ubuntu `.deb` installer
- Portable `.AppImage`
- Native `syncchat-desktop` binary

The AppImage bundles the media framework required by SyncChat audio/video features. Linux builds use Ubuntu 22.04 as the compatibility baseline.

## Automated installer builds

`.github/workflows/desktop-macos-linux-installers.yml` builds and verifies macOS and Linux packages whenever relevant desktop/frontend files land on `main`, and it can also be started manually with **Run workflow**.

Artifacts include:

- installer/package files
- `SHA256SUMS.txt`
- `BUILD-INFO.txt`
- MIT `LICENSE`

The existing `desktop-rust-ci.yml` continues to produce the Windows installers.

## Branding

Desktop icons are generated from the exact mobile application logo:

```text
../mobile/assets/syncchat_logo.png
```

`npm run icons` calls the Tauri icon generator and creates the Windows `.ico`, macOS `.icns`, PNG and store icon variants in `src-tauri/icons/`. The generated icon directory is intentionally not committed so there is only one source-of-truth logo in the repository.

## Local macOS build

Requirements:

- macOS with Xcode Command Line Tools
- Node.js 24.x + npm
- Rust stable through rustup

Run from the repository root:

```bash
bash desktop/build-macos.sh
```

Expected output root:

```text
desktop/src-tauri/target/universal-apple-darwin/release/bundle/
├── dmg/*.dmg
└── macos/SyncChat.app
```

By default the helper uses an ad-hoc signing identity (`-`). If a valid Apple signing identity is configured in `APPLE_SIGNING_IDENTITY`, that value is preserved instead.

## Local Linux build

Recommended baseline: Ubuntu 22.04 or Debian 12 with WebKitGTK 4.1.

On Ubuntu/Debian install the native dependencies:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf \
  xdg-utils \
  gstreamer1.0-plugins-base \
  gstreamer1.0-plugins-good \
  gstreamer1.0-libav
```

Then run:

```bash
bash desktop/build-linux.sh
```

Expected output root:

```text
desktop/src-tauri/target/release/bundle/
├── deb/*.deb
└── appimage/*.AppImage
```

## Local Windows build

Requirements:

- Windows 10 or Windows 11
- Node.js 24.x
- npm 11.x
- Rust stable through rustup
- Microsoft C++ Build Tools / Visual Studio Build Tools with the Desktop development with C++ workload

From the repository root:

```powershell
cd desktop
.\build-windows.ps1
```

Expected outputs:

```text
desktop\src-tauri\target\release\syncchat-desktop.exe
desktop\src-tauri\target\release\bundle\nsis\...
desktop\src-tauri\target\release\bundle\msi\...
```

To build only the native executable without installer bundles:

```powershell
.\build-windows.ps1 -BinaryOnly
```

## Development

Install dependencies once:

```bash
npm --prefix frontend ci
npm --prefix desktop install --ignore-scripts
```

Then from `desktop/`:

```bash
npm run dev
```

Tauri starts the existing frontend development server on port 3000 and opens it inside the native desktop window.

## Production endpoints

The desktop Web build defaults to:

```text
API_BASE_URL=https://api.syncchat.live/api
SOCKET_URL=https://api.syncchat.live
PUBLIC_ORIGIN=https://syncchat.live
```

They can be overridden for a build without changing source code:

```bash
SYNCCHAT_API_BASE_URL='https://api.example.com/api' \
SYNCCHAT_SOCKET_URL='https://api.example.com' \
SYNCCHAT_PUBLIC_ORIGIN='https://example.com' \
npm --prefix desktop run build
```

## Desktop behavior

- Closing the main window hides SyncChat to the system tray.
- Clicking the tray icon restores and focuses the main window.
- The tray menu includes **Open SyncChat** and **Quit SyncChat**.
- Starting SyncChat a second time focuses the existing process instead of creating a duplicate app instance.
- Installed builds register the `syncchat://` custom URL scheme.
- External `http`, `https`, `mailto` and `tel` links are opened with the operating-system default application.
- The desktop bridge exposes `window.SyncChatDesktop` for explicit native notification and autostart actions without requesting permission automatically.

## Security model

Tauri IPC capabilities are limited to the local `main` window. The desktop shell grants only the plugin defaults required for app functionality; it does not expose unrestricted shell execution. The Web bundle uses a Tauri Content Security Policy and only secure HTTP/WebSocket connections are expected for production services.

## License

This folder uses the repository's **MIT License**. See `LICENSE`.
