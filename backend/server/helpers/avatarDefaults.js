const DEFAULT_USER_AVATAR_URL = '/assets/icons/user-avatar.svg';
const DEFAULT_GROUP_AVATAR_URL = '/assets/icons/group-avatar.svg';
const DEFAULT_CHANNEL_AVATAR_URL = '/assets/icons/channel-avatar.svg';

const normalizeAvatar = (value = '') => String(value || '').trim();

const isDefaultUserAvatar = (value) =>
  normalizeAvatar(value) === DEFAULT_USER_AVATAR_URL;

const isDefaultGroupAvatar = (value) =>
  normalizeAvatar(value) === DEFAULT_GROUP_AVATAR_URL;

const isDefaultChannelAvatar = (value) =>
  normalizeAvatar(value) === DEFAULT_CHANNEL_AVATAR_URL;

module.exports = {
  DEFAULT_USER_AVATAR_URL,
  DEFAULT_GROUP_AVATAR_URL,
  DEFAULT_CHANNEL_AVATAR_URL,
  isDefaultUserAvatar,
  isDefaultGroupAvatar,
  isDefaultChannelAvatar,
};
