const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizePrivacyChoice,
  normalizePrivacySettingPayload,
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
