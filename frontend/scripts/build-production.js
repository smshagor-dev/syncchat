const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const webpackCliPath = path.join(rootDir, 'node_modules', 'webpack-cli', 'bin', 'cli.js');
const webpackConfigPath = path.join(rootDir, 'webpack.prod.js');
const publicRoot = path.join(rootDir, 'client', 'public');
const pwaSourceRoot = path.join(rootDir, 'pwa');
const clientIndexPath = path.join(rootDir, 'client', 'index.jsx');
const chatRoutePath = path.join(rootDir, 'client', 'routes', 'chat.jsx');
const desktopSidebarPath = path.join(
  rootDir,
  'client',
  'components',
  'chat',
  'foreground',
  'sidebar.jsx'
);
const mobileNavPath = path.join(
  rootDir,
  'client',
  'components',
  'chat',
  'foreground',
  'mobileNav.jsx'
);
const roomAppearancePath = path.join(
  rootDir,
  'client',
  'helpers',
  'roomAppearance.js'
);
const localFirstRuntimePath = path.join(
  rootDir,
  'client',
  'helpers',
  'localFirstRuntime.js'
);
const desktopStylePath = path.join(
  rootDir,
  'client',
  'styles',
  'desktopMessenger.css'
);
const parityStylePath = path.join(rootDir, 'client', 'styles', 'webDesktopParity.css');
const mobileStylePath = path.join(rootDir, 'client', 'styles', 'mobileWebMessenger.css');

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

const assertSourceContains = (filePath, requiredTokens, label) => {
  if (!fs.existsSync(filePath)) {
    fail(`${label} source is missing.`, { filePath });
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const missingTokens = requiredTokens.filter((token) => !source.includes(token));
  if (missingTokens.length) {
    fail(`${label} parity contract is incomplete.`, {
      filePath,
      missingTokens,
    });
  }
};

if (!fs.existsSync(webpackCliPath)) {
  fail('webpack-cli is not installed. Run npm install first.', {
    webpackCliPath,
    cwd: rootDir,
  });
}

/*
 * Web and Tauri Desktop intentionally ship the same frontend/client bundle.
 * Fail the production build if a future refactor drops the shared messenger
 * shell, approved desktop reference layout, mobile Web presentation, or
 * local-first boot.
 */
assertSourceContains(
  clientIndexPath,
  [
    "./styles/desktopMessenger.css",
    "./styles/desktopPages.css",
    "./styles/webDesktopParity.css",
    "./styles/mobileWebMessenger.css",
    "./helpers/localFirstRuntime",
    'installLocalFirstRuntime(store)',
  ],
  'Desktop/Web style and startup'
);
assertSourceContains(
  localFirstRuntimePath,
  [
    'syncchat.local-first.boot.v1',
    "'/settings'",
    "'/users'",
    "'/app-config'",
    "'/inboxes'",
    'indexedDB',
    'revalidate',
  ],
  'Local-first startup'
);
assertSourceContains(
  chatRoutePath,
  ['data-syncchat-desktop-app', 'data-syncchat-desktop-shell'],
  'Messenger shell'
);
assertSourceContains(
  desktopSidebarPath,
  [
    'data-syncchat-desktop-sidebar',
    'desktopPrimaryActions',
    "label: 'Chats'",
    "label: 'Status'",
    "label: 'Communities'",
    "label: 'Channels'",
    "label: 'Calls'",
    "label: 'Contacts'",
    "label: 'Saved Messages'",
    "label: 'Settings'",
    'bg-violet-600 text-white',
  ],
  'Approved desktop navigation'
);
assertSourceContains(
  desktopStylePath,
  [
    '--syncchat-desktop-rail: 172px',
    '--syncchat-desktop-list: 324px',
    '--syncchat-desktop-accent: #7c3aed',
    'grid-template-columns: var(--syncchat-desktop-rail) minmax(0, 1fr)',
    'Approved reference: wide, white, icon + text navigation rail.',
  ],
  'Approved desktop reference layout'
);
assertSourceContains(
  roomAppearancePath,
  [
    "sentBubbleBg: '#ede9fe'",
    "receivedBubbleBg: '#ffffff'",
    'migrateLegacyReferenceDefaults',
  ],
  'Approved desktop message appearance'
);
assertSourceContains(
  mobileNavPath,
  ['data-syncchat-mobile-nav', 'fixed inset-x-0 bottom-0'],
  'Mobile Web navigation'
);
if (!fs.existsSync(parityStylePath)) {
  fail('Browser desktop parity stylesheet is missing.', { parityStylePath });
}
if (!fs.existsSync(mobileStylePath)) {
  fail('Mobile Web messenger stylesheet is missing.', { mobileStylePath });
}

log('Desktop/Web reference, Mobile Web and local-first startup contracts verified.');
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
