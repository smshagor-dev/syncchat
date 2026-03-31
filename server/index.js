const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const publicRoot = path.join(rootDir, 'client', 'public');
const requiredBuildFiles = [
  path.join(publicRoot, 'index.html'),
  path.join(publicRoot, 'admin', 'index.html'),
];

const hasFrontendBuild = () => requiredBuildFiles.every((filePath) => fs.existsSync(filePath));

const ensureFrontendBuild = () => {
  if (hasFrontendBuild()) return;

  const buildScriptPath = path.join(rootDir, 'scripts', 'build-production.js');
  if (!fs.existsSync(buildScriptPath)) {
    throw new Error(
      'Frontend build helper is missing. Restore scripts/build-production.js and try again.'
    );
  }

  console.log('[startup] Frontend build missing. Building client and admin bundles...');
  const build = spawnSync(process.execPath, [buildScriptPath], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });

  if (build.status !== 0 || !hasFrontendBuild()) {
    throw new Error('Frontend build failed. Fix the build errors and try again.');
  }
};

ensureFrontendBuild();

const server = require('./server');
const connectDb = require('./db/connect');
const { startScheduledMessageWorker } = require('./helpers/scheduledMessages');

const port = process.env.PORT || 8080;

(async () => {
  await connectDb();
  startScheduledMessageWorker();
  server.listen(port);
  console.log(`[${port}] server running...`);
})();
