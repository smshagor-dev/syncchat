#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo 'build-macos.sh must be run on macOS.' >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || { echo 'Node.js 24.x is required.' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo 'npm is required.' >&2; exit 1; }
command -v rustup >/dev/null 2>&1 || { echo 'Rust via rustup is required.' >&2; exit 1; }
command -v xcode-select >/dev/null 2>&1 || { echo 'Xcode Command Line Tools are required.' >&2; exit 1; }

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" != "24" ]]; then
  echo "Node.js 24.x is required; found $(node --version)." >&2
  exit 1
fi

xcode-select -p >/dev/null
rustup target add aarch64-apple-darwin x86_64-apple-darwin

npm --prefix "$repo_root/frontend" ci
npm --prefix "$script_dir" install --ignore-scripts

cd "$script_dir"
export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:--}"
npm run build:macos

echo
echo 'macOS bundles:'
find src-tauri/target/universal-apple-darwin/release/bundle -maxdepth 2 \( -name '*.dmg' -o -name '*.app' \) -print
