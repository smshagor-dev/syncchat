# SyncChat Desktop

SyncChat Desktop is the native desktop distribution of SyncChat. It uses **Rust + Tauri 2** for the native shell and bundles the existing production Web client locally, so the desktop UI stays aligned with the Web application instead of maintaining a second desktop UI implementation.

## Architecture

```text
SyncChat Desktop
├── Rust / Tauri native shell
│   ├── native window lifecycle
│   ├── system tray + minimize-to-tray
│   ├── single-instance enforcement
│   ├── syncchat:// deep links
│   ├── native notifications capability
│   ├── native file/dialog capability
│   ├── autostart capability
│   └── external URL opener
├── Bundled SyncChat Web UI
│   └── generated from ../frontend/client/public
└── Production services
    ├── https://api.syncchat.live/api
    ├── https://api.syncchat.live
    └── https://syncchat.live
```

The user does **not** need Node.js or a local web server after the application has been built. The frontend assets are bundled by Tauri and loaded from the native application package.

## Branding

Desktop icons are generated from the exact mobile application logo:

```text
../mobile/assets/syncchat_logo.png
```

`npm run icons` calls the Tauri icon generator and creates the Windows `.ico`, macOS `.icns`, PNG and store icon variants in `src-tauri/icons/`. The generated icon directory is intentionally not committed so there is only one source-of-truth logo in the repository.

## License

This folder uses the repository's **MIT License**. See `LICENSE`.

## Requirements for Windows builds

- Windows 10 or Windows 11
- Node.js 24.x
- npm 11.x
- Rust stable through rustup
- Microsoft C++ Build Tools / Visual Studio Build Tools with the Desktop development with C++ workload
- WebView2 does not need to be preinstalled for the generated installers because the Windows bundle uses Tauri's `offlineInstaller` mode

MSI generation uses WiX through Tauri. If MSI creation reports that VBSCRIPT is unavailable, enable the Windows VBSCRIPT optional feature or build the NSIS installer only.

## Local Windows build

From the repository root:

```powershell
cd desktop
.\build-windows.ps1
```

The script installs the frontend dependencies, installs Tauri CLI dependencies, generates the desktop icons from the mobile logo, builds the production Web client, compiles Rust and creates the Windows installers.

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

```powershell
npm --prefix ..\frontend ci
npm install
```

Then:

```powershell
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

```powershell
$env:SYNCCHAT_API_BASE_URL='https://api.example.com/api'
$env:SYNCCHAT_SOCKET_URL='https://api.example.com'
$env:SYNCCHAT_PUBLIC_ORIGIN='https://example.com'
npm run build
```

## Desktop behavior

- Closing the main window hides SyncChat to the system tray.
- Clicking the tray icon restores and focuses the main window.
- The tray menu includes **Open SyncChat** and **Quit SyncChat**.
- Starting SyncChat a second time focuses the existing process instead of creating a duplicate app instance.
- Installed builds register the `syncchat://` custom URL scheme.
- `syncchat://chat?...` is forwarded to the bundled `/chat?...` route.
- External `http`, `https`, `mailto` and `tel` links are opened with the operating-system default application.
- The desktop bridge exposes `window.SyncChatDesktop` for explicit native notification and autostart actions without requesting permission automatically.

## Security model

Tauri IPC capabilities are limited to the local `main` window. The desktop shell grants only the plugin defaults required for app functionality; it does not expose unrestricted shell execution. The Web bundle uses a Tauri Content Security Policy and only secure HTTP/WebSocket connections are expected for production services.

## Windows runtime packaging

Windows uses:

- static Visual C++ runtime linking
- NSIS installer
- MSI installer
- offline WebView2 installer bundle

The offline WebView2 mode increases installer size, but allows installation without downloading WebView2 during setup. On normal Windows 10/11 systems the app continues to use the secure system-managed WebView2 runtime after installation.
