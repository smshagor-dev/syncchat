const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { randomUUID } = require('node:crypto');

const serverRoot = path.resolve(__dirname, '../server');

const walkJs = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJs(target);
    return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
  });

test('backend CommonJS runtime does not require the ESM-only uuid package', () => {
  const offenders = walkJs(serverRoot)
    .filter((file) => /require\(\s*['"]uuid['"]\s*\)/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(serverRoot, file));

  assert.deepEqual(offenders, []);
});

test('Node crypto.randomUUID provides a UUID v4 compatible identifier', () => {
  const value = randomUUID();
  assert.match(
    value,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});


test('backend package does not carry the unused uuid runtime dependency', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'),
  );
  assert.equal(packageJson.dependencies?.uuid, undefined);
});
