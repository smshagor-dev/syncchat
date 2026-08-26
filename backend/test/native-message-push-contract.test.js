const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../server/helpers/pushNotifications.js'),
  'utf8'
);
const nativeSource = fs.readFileSync(
  path.join(__dirname, '../server/helpers/nativeMessagePush.js'),
  'utf8'
);

test('normal push fanout includes native mobile delivery independently of VAPID', () => {
  assert.match(source, /sendNativeMessagePush/);
  assert.match(source, /const nativePromise = safeNativePush/);
  assert.match(source, /reason: 'vapid_missing'/);
  assert.match(source, /native,/);
});

test('native message delivery targets standard tokens and preserves room routing data', () => {
  assert.match(nativeSource, /tokenType: 'standard'/);
  assert.match(nativeSource, /type: 'message'/);
  assert.match(nativeSource, /syncchat_messages/);
  assert.match(nativeSource, /roomId/);
  assert.match(nativeSource, /category === 'call'/);
});
