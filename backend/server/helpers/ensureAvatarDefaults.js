const ProfileModel = require('../db/models/profile');
const GroupModel = require('../db/models/group');
const ChannelModel = require('../db/models/channel');
const {
  DEFAULT_USER_AVATAR_URL,
  DEFAULT_GROUP_AVATAR_URL,
  DEFAULT_CHANNEL_AVATAR_URL,
} = require('./avatarDefaults');
const logger = require('./logger');

let migrationPromise = null;

const LEGACY_USER_DEFAULTS = [
  'assets/images/default-avatar.png',
  '/assets/images/default-avatar.png',
  '/default-avatar.png',
  'https://syncchat.smshagor.com/uploads/avatar.jpg',
  'https://syncchat.smshagor.com/uploads/default-avatar.png',
  'https://syncchat.live/assets/images/default-avatar.png',
];
const LEGACY_GROUP_DEFAULTS = [
  'assets/images/default-group-avatar.png',
  '/assets/images/default-group-avatar.png',
  '/default-group-avatar.png',
  'https://syncchat.smshagor.com/uploads/default-group-avatar.png',
  'https://syncchat.live/assets/images/default-group-avatar.png',
  ...LEGACY_USER_DEFAULTS,
];
const LEGACY_CHANNEL_DEFAULTS = [
  'assets/images/default-channel-avatar.png',
  '/assets/images/default-channel-avatar.png',
  '/default-channel-avatar.png',
  'https://syncchat.smshagor.com/uploads/default-channel-avatar.png',
  'https://syncchat.live/assets/images/default-channel-avatar.png',
  ...LEGACY_GROUP_DEFAULTS,
];

const updateMissingAvatar = async (Model, value, legacyValues = []) => {
  let updated = 0;
  const candidates = [null, '', ...legacyValues];

  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const [count] = await Model.update(
      { avatar: value },
      { where: { avatar: candidate } }
    );
    updated += Number(count || 0);
  }

  return updated;
};

const ensureAvatarDefaults = async () => {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const [profiles, groups, channels] = await Promise.all([
      updateMissingAvatar(
        ProfileModel,
        DEFAULT_USER_AVATAR_URL,
        LEGACY_USER_DEFAULTS
      ),
      updateMissingAvatar(
        GroupModel,
        DEFAULT_GROUP_AVATAR_URL,
        LEGACY_GROUP_DEFAULTS
      ),
      updateMissingAvatar(
        ChannelModel,
        DEFAULT_CHANNEL_AVATAR_URL,
        LEGACY_CHANNEL_DEFAULTS
      ),
    ]);

    if (profiles || groups || channels) {
      logger.info('AVATAR_DEFAULTS_REPAIRED', {
        profiles,
        groups,
        channels,
      });
    }

    return { profiles, groups, channels };
  })().catch((error) => {
    migrationPromise = null;
    throw error;
  });

  return migrationPromise;
};

module.exports = ensureAvatarDefaults;
