const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizePrivacyChoice,
  normalizePrivacySettingPayload,
  sanitizeProfileForViewer,
} = require('../server/helpers/privacy');

test('mobile contacts privacy alias normalizes to canonical my_contacts', () => {
  assert.equal(normalizePrivacyChoice('contacts'), 'my_contacts');
  assert.equal(normalizePrivacyChoice('my_contacts'), 'my_contacts');
  assert.equal(normalizePrivacyChoice('everyone'), 'everyone');
  assert.equal(normalizePrivacyChoice('nobody'), 'nobody');
});

test('invalid privacy values fail safely to the configured fallback', () => {
  assert.equal(normalizePrivacyChoice('unexpected'), 'everyone');
  assert.equal(normalizePrivacyChoice('unexpected', 'nobody'), 'nobody');
});

test('mobile privacy payload never broadens contacts-only visibility', () => {
  const normalized = normalizePrivacySettingPayload({
    lastSeenVisibility: 'contacts',
    onlineVisibility: 'contacts',
    profilePhotoVisibility: 'contacts',
    statusVisibility: 'contacts',
    groupsVisibility: 'contacts',
  });

  assert.equal(normalized.lastSeenVisibility, 'my_contacts');
  assert.equal(normalized.onlineVisibility, 'my_contacts');
  assert.equal(normalized.profilePhotoVisibility, 'my_contacts');
  assert.equal(normalized.statusVisibility, 'my_contacts');
  assert.equal(normalized.groupsVisibility, 'my_contacts');
});

test('sanitized profile cannot leak hidden last seen through updatedAt', () => {
  const updatedAt = '2026-08-27T12:34:56.000Z';
  const hidden = sanitizeProfileForViewer({
    profile: {
      userId: 'target-user',
      fullname: 'Target User',
      online: true,
      updatedAt,
    },
    viewerId: 'viewer-user',
    setting: {
      lastSeenVisibility: 'nobody',
      onlineVisibility: 'nobody',
      profilePhotoVisibility: 'everyone',
    },
  });

  assert.equal(hidden.canSeeLastSeen, false);
  assert.equal(hidden.canSeeOnline, false);
  assert.equal(hidden.online, false);
  assert.equal(hidden.lastSeenAt, null);
  assert.equal(hidden.updatedAt, null);
  assert.equal(hidden.presenceLabel, 'hidden');
});

test('sanitized profile preserves visible last seen timestamp', () => {
  const updatedAt = '2026-08-27T12:34:56.000Z';
  const visible = sanitizeProfileForViewer({
    profile: {
      userId: 'target-user',
      fullname: 'Target User',
      online: false,
      updatedAt,
    },
    viewerId: 'viewer-user',
    setting: {
      lastSeenVisibility: 'everyone',
      onlineVisibility: 'everyone',
      profilePhotoVisibility: 'everyone',
    },
  });

  assert.equal(visible.canSeeLastSeen, true);
  assert.equal(visible.updatedAt, updatedAt);
  assert.equal(visible.lastSeenAt, updatedAt);
  assert.equal(visible.presenceLabel, 'last_seen');
});
