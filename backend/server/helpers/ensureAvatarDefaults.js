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

const updateMissingAvatar = async (Model, value) => {
  const [nullCount] = await Model.update(
    { avatar: value },
    { where: { avatar: null } }
  );
  const [emptyCount] = await Model.update(
    { avatar: value },
    { where: { avatar: '' } }
  );
  return Number(nullCount || 0) + Number(emptyCount || 0);
};

const ensureAvatarDefaults = async () => {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const [profiles, groups, channels] = await Promise.all([
      updateMissingAvatar(ProfileModel, DEFAULT_USER_AVATAR_URL),
      updateMissingAvatar(GroupModel, DEFAULT_GROUP_AVATAR_URL),
      updateMissingAvatar(ChannelModel, DEFAULT_CHANNEL_AVATAR_URL),
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
