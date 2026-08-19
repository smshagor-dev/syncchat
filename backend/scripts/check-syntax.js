const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOTS = [path.resolve(__dirname, '..', 'server'), path.resolve(__dirname, '..', 'api')];
const EXCLUDED_DIRS = new Set(['node_modules', 'logs', 'uploads', 'coverage']);

const collect = (target, output = []) => {
  if (!fs.existsSync(target)) return output;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      collect(path.join(target, entry), output);
    }
    return output;
  }
  if (target.endsWith('.js')) output.push(target);
  return output;
};

const files = ROOTS.flatMap((root) => collect(root)).sort();
let failed = 0;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    failed += 1;
    process.stderr.write(`\nSyntax check failed: ${path.relative(process.cwd(), file)}\n`);
    process.stderr.write(result.stderr || result.stdout || 'Unknown syntax error\n');
  }
}

if (failed > 0) {
  process.stderr.write(`\n${failed} backend file(s) failed syntax validation.\n`);
  process.exit(1);
}

process.stdout.write(`Checked ${files.length} backend JavaScript files successfully.\n`);
