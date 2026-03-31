const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const webpackCliPath = path.join(rootDir, 'node_modules', 'webpack-cli', 'bin', 'cli.js');
const webpackConfigPath = path.join(rootDir, 'webpack.prod.js');

if (!fs.existsSync(webpackCliPath)) {
  console.error('webpack-cli is not installed. Run npm install first.');
  process.exit(1);
}

const build = spawnSync(process.execPath, [webpackCliPath, '--config', webpackConfigPath], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
});

process.exit(build.status ?? 1);
