param(
    [switch]$BinaryOnly
)

$ErrorActionPreference = 'Stop'
$DesktopRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $DesktopRoot

function Require-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required. $Hint"
    }
}

Require-Command 'node' 'Install Node.js 24.x.'
Require-Command 'npm' 'Install npm 11.x.'
Require-Command 'rustc' 'Install Rust with rustup from https://rustup.rs.'
Require-Command 'cargo' 'Install Rust with rustup from https://rustup.rs.'

$nodeVersion = node --version
$rustVersion = rustc --version
Write-Host "Node: $nodeVersion"
Write-Host "Rust: $rustVersion"

Push-Location $RepoRoot
try {
    Write-Host 'Installing frontend dependencies...'
    npm --prefix frontend ci

    Write-Host 'Installing desktop/Tauri dependencies...'
    npm --prefix desktop install

    if ($BinaryOnly) {
        Write-Host 'Building SyncChat native executable without installer bundles...'
        npm --prefix desktop run build:binary
    }
    else {
        Write-Host 'Building SyncChat Windows executable + NSIS/MSI installers...'
        npm --prefix desktop run build
    }

    $releaseRoot = Join-Path $DesktopRoot 'src-tauri\target\release'
    Write-Host ''
    Write-Host 'Build complete.' -ForegroundColor Green
    Write-Host "Binary: $releaseRoot\syncchat-desktop.exe"
    if (-not $BinaryOnly) {
        Write-Host "Installers: $releaseRoot\bundle\nsis and $releaseRoot\bundle\msi"
    }
}
finally {
    Pop-Location
}
