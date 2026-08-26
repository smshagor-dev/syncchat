const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldNotifyCategory,
  resolveBody,
  fcmConfigured,
  apnsConfigured,
} = require('../server/helpers/nativeMessagePush');

test('native message push respects category notification settings', () => {
  assert.equal(shouldNotifyCategory(null, 'message'), true);
  assert.equal(shouldNotifyCategory({ mute: true }, 'message'), false);
  assert.equal(
    shouldNotifyCategory({ showPushNotification: false }, 'message'),
    false
  );
  assert.equal(shouldNotifyCategory({ notifyMessages: false }, 'message'), false);
  assert.equal(shouldNotifyCategory({ notifyGroups: false }, 'group'), false);
  assert.equal(shouldNotifyCategory({ notifyStatus: false }, 'status'), false);
  assert.equal(shouldNotifyCategory({}, 'call'), false);
});

test('native message preview follows the privacy preference', () => {
  assert.equal(
    resolveBody({ showNotificationPreviews: false }, 'Secret text', 'New message'),
    'New message'
  );
  assert.equal(
    resolveBody({ showNotificationPreviews: true }, 'Hello', 'New message'),
    'Hello'
  );
});

test('native provider readiness requires complete FCM and APNs credentials', () => {
  assert.equal(
    fcmConfigured({
      enabled: true,
      projectId: 'project',
      clientEmail: 'firebase@example.com',
      privateKey: 'key',
    }),
    true
  );
  assert.equal(fcmConfigured({ enabled: true, projectId: 'project' }), false);

  assert.equal(
    apnsConfigured({
      enabled: true,
      teamId: 'TEAM',
      keyId: 'KEY',
      bundleId: 'com.syncchat.app',
      privateKey: 'key',
    }),
    true
  );
  assert.equal(apnsConfigured({ enabled: true, teamId: 'TEAM' }), false);
});
