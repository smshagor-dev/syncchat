import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(desktopRoot, '..');
const frontendRoot = path.join(repoRoot, 'frontend');
const publicRoot = path.join(frontendRoot, 'client', 'public');
const distRoot = path.join(desktopRoot, 'dist');

function npmInvocation(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...args],
      shell: false,
    };
  }

  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args,
    shell: process.platform === 'win32',
  };
}

const env = {
  ...process.env,
  API_BASE_URL:
    process.env.SYNCCHAT_API_BASE_URL ||
    process.env.API_BASE_URL ||
    'https://api.syncchat.live/api',
  SOCKET_URL:
    process.env.SYNCCHAT_SOCKET_URL ||
    process.env.SOCKET_URL ||
    'https://api.syncchat.live',
  PUBLIC_ORIGIN:
    process.env.SYNCCHAT_PUBLIC_ORIGIN ||
    process.env.PUBLIC_ORIGIN ||
    'https://syncchat.live',
};

env.CLIENT_API_BASE_URL = env.CLIENT_API_BASE_URL || env.API_BASE_URL;
env.CLIENT_SOCKET_URL = env.CLIENT_SOCKET_URL || env.SOCKET_URL;
env.CLIENT_PUBLIC_ORIGIN = env.CLIENT_PUBLIC_ORIGIN || env.PUBLIC_ORIGIN;

console.log('[desktop:web] Building SyncChat web client for the native bundle...');
const npm = npmInvocation(['run', 'build']);
const build = spawnSync(npm.command, npm.args, {
  cwd: frontendRoot,
  env,
  stdio: 'inherit',
  shell: npm.shell,
});

if (build.error) throw build.error;
if (build.status !== 0) {
  throw new Error(`SyncChat frontend build failed with exit code ${build.status}.`);
}
if (!existsSync(path.join(publicRoot, 'index.html'))) {
  throw new Error('frontend/client/public/index.html was not produced.');
}

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(distRoot, { recursive: true });
cpSync(publicRoot, distRoot, { recursive: true, force: true });
cpSync(
  path.join(scriptDir, 'desktop-runtime.js'),
  path.join(distRoot, 'syncchat-desktop.js'),
  { force: true },
);

const indexPath = path.join(distRoot, 'index.html');
let index = readFileSync(indexPath, 'utf8');
const runtimeTag = '<script src="/syncchat-desktop.js"></script>';
if (!index.includes(runtimeTag)) {
  index = index.includes('</body>')
    ? index.replace('</body>', `  ${runtimeTag}\n</body>`)
    : `${index}\n${runtimeTag}\n`;
  writeFileSync(indexPath, index, 'utf8');
}

console.log('[desktop:web] Bundle ready:', distRoot);
console.log('[desktop:web] API:', env.API_BASE_URL);
console.log('[desktop:web] Socket:', env.SOCKET_URL);
console.log('[desktop:web] Public origin:', env.PUBLIC_ORIGIN);
