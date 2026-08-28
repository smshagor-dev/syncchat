#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo 'build-linux.sh must be run on Linux.' >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || { echo 'Node.js 24.x is required.' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo 'npm is required.' >&2; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo 'Rust/Cargo is required.' >&2; exit 1; }
command -v pkg-config >/dev/null 2>&1 || { echo 'pkg-config is required.' >&2; exit 1; }

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" != "24" ]]; then
  echo "Node.js 24.x is required; found $(node --version)." >&2
  exit 1
fi

if ! pkg-config --exists webkit2gtk-4.1; then
  cat >&2 <<'EOF'
Missing WebKitGTK 4.1 development dependencies.
On Ubuntu/Debian install:
  sudo apt update
  sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-libav
EOF
  exit 1
fi

npm --prefix "$repo_root/frontend" ci
npm --prefix "$script_dir" install --ignore-scripts

cd "$script_dir"
npm run build:linux

echo
echo 'Linux bundles:'
find src-tauri/target/release/bundle -maxdepth 2 \( -name '*.deb' -o -name '*.AppImage' \) -print
