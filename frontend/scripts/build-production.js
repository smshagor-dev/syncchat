const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const webpackCliPath = path.join(rootDir, 'node_modules', 'webpack-cli', 'bin', 'cli.js');
const webpackConfigPath = path.join(rootDir, 'webpack.prod.js');
const publicRoot = path.join(rootDir, 'client', 'public');
const pwaSourceRoot = path.join(rootDir, 'pwa');

const log = (message, extra = null) => {
  if (extra === null || typeof extra === 'undefined') {
    console.log(`[build:prod] ${message}`);
    return;
  }

  console.log(`[build:prod] ${message}`, extra);
};

const fail = (message, extra = null, exitCode = 1) => {
  if (extra === null || typeof extra === 'undefined') {
    console.error(`[build:prod] ${message}`);
  } else {
    console.error(`[build:prod] ${message}`, extra);
  }
  process.exit(exitCode);
};

if (!fs.existsSync(webpackCliPath)) {
  fail('webpack-cli is not installed. Run npm install first.', {
    webpackCliPath,
    cwd: rootDir,
  });
}

log('Starting production build', {
  node: process.version,
  execPath: process.execPath,
  cwd: rootDir,
  webpackCliPath,
  webpackConfigPath,
  publicRoot,
  pwaSourceRoot,
  nodeEnv: 'production',
  nodeOptions: process.env.NODE_OPTIONS || '',
});

const build = spawnSync(
  process.execPath,
  [webpackCliPath, '--config', webpackConfigPath],
  {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }
);

if (build.stdout) {
  process.stdout.write(build.stdout);
}

if (build.stderr) {
  process.stderr.write(build.stderr);
}

if (build.error) {
  fail('Build process failed before completion.', {
    message: build.error.message,
    code: build.error.code || '',
    errno: build.error.errno || '',
    syscall: build.error.syscall || '',
    path: build.error.path || '',
    spawnargs: build.error.spawnargs || [],
  });
}

if (build.signal) {
  fail('Build process was terminated by signal.', {
    signal: build.signal,
    status: build.status,
    hint:
      'This usually means the host killed webpack for memory/process limits in cPanel.',
  });
}

if (build.status !== 0) {
  fail('Build exited with non-zero status.', {
    status: build.status,
    stdoutPreview: String(build.stdout || '').slice(-2000),
    stderrPreview: String(build.stderr || '').slice(-2000),
  });
}

if (!fs.existsSync(path.join(publicRoot, 'index.html'))) {
  fail('Build finished but client/public/index.html was not generated.', {
    publicRoot,
  });
}

if (!fs.existsSync(pwaSourceRoot)) {
  fail('PWA source assets are missing.', { pwaSourceRoot });
}

fs.cpSync(pwaSourceRoot, publicRoot, {
  recursive: true,
  force: true,
});

const requiredPwaAssets = [
  'manifest.json',
  'service-worker.js',
  'installPrompt.js',
  'pwa-192x192.png',
  'pwa-512x512.png',
];

const missingPwaAssets = requiredPwaAssets.filter(
  (file) => !fs.existsSync(path.join(publicRoot, file))
);
if (missingPwaAssets.length) {
  fail('Production build is missing required PWA assets.', {
    missingPwaAssets,
    publicRoot,
  });
}

log('PWA assets copied successfully.');
log('Production build completed successfully.');

process.exit(0);
