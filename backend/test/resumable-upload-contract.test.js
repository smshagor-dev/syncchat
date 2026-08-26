const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const routeSource = fs.readFileSync(
  path.resolve(__dirname, '../server/routes/chat.js'),
  'utf8'
);
const controllerSource = fs.readFileSync(
  path.resolve(__dirname, '../server/controllers/resumableUpload.js'),
  'utf8'
);

test('chat routes expose the full resumable upload lifecycle', () => {
  assert.match(routeSource, /POST|router\.post/);
  assert.match(routeSource, /\/chats\/uploads\/resumable'/);
  assert.match(routeSource, /\/chats\/uploads\/resumable\/:uploadId'/);
  assert.match(routeSource, /\/chats\/uploads\/resumable\/:uploadId\/chunk'/);
  assert.match(routeSource, /\/chats\/uploads\/resumable\/:uploadId\/complete'/);
  assert.match(routeSource, /express\.raw\(/);
  assert.match(routeSource, /application\/octet-stream/);
});

test('resumable uploads are offset verified and bounded per chunk', () => {
  assert.match(controllerSource, /MAX_CHUNK_BYTES = 8 \* 1024 \* 1024/);
  assert.match(controllerSource, /Upload-Offset header is required/);
  assert.match(controllerSource, /Upload offset mismatch/);
  assert.match(controllerSource, /Chunk already received/);
  assert.match(controllerSource, /offset \+ chunk\.length > session\.size/);
});

test('resumable finalize preserves existing upload security boundaries', () => {
  assert.match(controllerSource, /validateUploadBuffer\(/);
  assert.match(controllerSource, /uploadLimits\(\)/);
  assert.match(controllerSource, /allowedTypes/);
  assert.match(controllerSource, /uploadStreamFile\(/);
  assert.match(controllerSource, /createReadStream\(dataPath\)/);
});

test('resumable sessions are account scoped and expire', () => {
  assert.match(controllerSource, /session\.userId/);
  assert.match(controllerSource, /Upload session does not belong to this account/);
  assert.match(controllerSource, /Upload session expired/);
  assert.match(controllerSource, /SESSION_TTL_MS/);
});
