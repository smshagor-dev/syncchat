const test = require('node:test');
const assert = require('node:assert/strict');

const ProfilePhotoModel = require('../server/db/models/profilePhoto');
const CallHistoryModel = require('../server/db/models/callHistory');
const SocialIdentityModel = require('../server/db/models/socialIdentity');

const keySignature = (spec = {}) =>
  Object.entries(spec)
    .map(([field, direction]) => `${field}:${direction}`)
    .join('|');

const assertNoDuplicateIndexKeys = (facade, label) => {
  const indexes = facade.mongoModel.schema.indexes();
  const seen = new Map();

  for (const [spec, options = {}] of indexes) {
    const signature = keySignature(spec);
    if (!signature) continue;
    assert.equal(
      seen.has(signature),
      false,
      `${label} declares duplicate MongoDB index keys (${signature}) via ${seen.get(signature) || 'unknown'} and ${options.name || 'auto-name'}`
    );
    seen.set(signature, options.name || 'auto-name');
  }
};

test('production models do not declare duplicate MongoDB index keys', () => {
  assertNoDuplicateIndexKeys(ProfilePhotoModel, 'profile_photos');
  assertNoDuplicateIndexKeys(CallHistoryModel, 'call_histories');
  assertNoDuplicateIndexKeys(SocialIdentityModel, 'social_identities');
});
