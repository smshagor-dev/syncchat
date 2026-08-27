const { Op } = require('sequelize');
const ContactModel = require('../db/models/contact');
const SettingModel = require('../db/models/setting');
const { asArray, toPlainMany, toPlain } = require('../db/utils');
const { toAbsoluteUploadUrl } = require('./storage');
const { DEFAULT_USER_AVATAR_URL } = require('./avatarDefaults');

const PRIVACY_OPTIONS = ['everyone', 'my_contacts', 'nobody'];
const PRIVACY_ALIASES = {
  contacts: 'my_contacts',
};

const DEFAULT_PRIVACY = {
  lastSeenVisibility: 'everyone',
  onlineVisibility: 'everyone',
  profilePhotoVisibility: 'everyone',
  statusVisibility: 'everyone',
  groupsVisibility: 'everyone',
  readReceiptsEnabled: true,
  messageRequestsEnabled: true,
  disableLinkPreviews: false,
  securityNotificationsEnabled: true,
};

const normalizePrivacyChoice = (value, fallback = 'everyone') => {
  const normalized = PRIVACY_ALIASES[value] || value;
  return PRIVACY_OPTIONS.includes(normalized) ? normalized : fallback;
};

const normalizePrivacySettingPayload = (raw = {}) => ({
  lastSeenVisibility: normalizePrivacyChoice(
    raw.lastSeenVisibility,
    DEFAULT_PRIVACY.lastSeenVisibility
  ),
  onlineVisibility: normalizePrivacyChoice(
    raw.onlineVisibility,
    DEFAULT_PRIVACY.onlineVisibility
  ),
  profilePhotoVisibility: normalizePrivacyChoice(
    raw.profilePhotoVisibility,
    DEFAULT_PRIVACY.profilePhotoVisibility
  ),
  statusVisibility: normalizePrivacyChoice(
    raw.statusVisibility,
    DEFAULT_PRIVACY.statusVisibility
  ),
  groupsVisibility: normalizePrivacyChoice(
    raw.groupsVisibility,
    DEFAULT_PRIVACY.groupsVisibility
  ),
  readReceiptsEnabled:
    typeof raw.readReceiptsEnabled === 'boolean'
      ? raw.readReceiptsEnabled
      : DEFAULT_PRIVACY.readReceiptsEnabled,
  messageRequestsEnabled:
    typeof raw.messageRequestsEnabled === 'boolean'
      ? raw.messageRequestsEnabled
      : DEFAULT_PRIVACY.messageRequestsEnabled,
  disableLinkPreviews:
    typeof raw.disableLinkPreviews === 'boolean'
      ? raw.disableLinkPreviews
      : DEFAULT_PRIVACY.disableLinkPreviews,
  securityNotificationsEnabled:
    typeof raw.securityNotificationsEnabled === 'boolean'
      ? raw.securityNotificationsEnabled
      : DEFAULT_PRIVACY.securityNotificationsEnabled,
});

const getSettingMap = async (userIds = []) => {
  const ids = [...new Set(asArray(userIds).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const rows = await SettingModel.findAll({
    where: {
      userId: { [Op.in]: ids },
    },
  });

  return new Map(
    toPlainMany(rows).map((item) => [
      item.userId,
      normalizePrivacySettingPayload(item),
    ])
  );
};

const getContactMap = async ({ ownerIds = [], friendIds = [] }) => {
  const uniqueOwners = [...new Set(asArray(ownerIds).filter(Boolean))];
  const uniqueFriends = [...new Set(asArray(friendIds).filter(Boolean))];
  if (uniqueOwners.length === 0 || uniqueFriends.length === 0) {
    return new Map();
  }

  const rows = await ContactModel.findAll({
    where: {
      userId: { [Op.in]: uniqueOwners },
      friendId: { [Op.in]: uniqueFriends },
    },
    attributes: ['userId', 'friendId'],
  });

  return new Map(
    toPlainMany(rows).map((item) => [`${item.userId}:${item.friendId}`, true])
  );
};

const isVisibleByRule = ({ rule = 'everyone', isContact = false }) => {
  if (rule === 'everyone') return true;
  if (rule === 'my_contacts') return !!isContact;
  return false;
};

const buildPrivacyContext = async ({ viewerId, targetIds = [] }) => {
  const ids = [...new Set(asArray(targetIds).filter(Boolean))];
  const settingMap = await getSettingMap(ids);
  const contactMap =
    viewerId && ids.length > 0
      ? await getContactMap({ ownerIds: [viewerId], friendIds: ids })
      : new Map();

  return {
    settingMap,
    isViewerContact(targetId) {
      return !!contactMap.get(`${viewerId}:${targetId}`);
    },
  };
};

const sanitizeProfileForViewer = ({
  profile,
  viewerId,
  setting,
  isViewerContact = false,
}) => {
  const payload = { ...(toPlain(profile) || profile || {}) };
  const privacy = normalizePrivacySettingPayload(setting);
  const isSelf = payload?.userId && viewerId && payload.userId === viewerId;

  const canSeeLastSeen =
    isSelf ||
    isVisibleByRule({
      rule: privacy.lastSeenVisibility,
      isContact: isViewerContact,
    });
  const canSeeOnline =
    isSelf ||
    isVisibleByRule({
      rule: privacy.onlineVisibility,
      isContact: isViewerContact,
    });
  const canSeeAvatar =
    isSelf ||
    isVisibleByRule({
      rule: privacy.profilePhotoVisibility,
      isContact: isViewerContact,
    });

  const visibleAvatar =
    canSeeAvatar && payload?.avatar
      ? toAbsoluteUploadUrl(payload.avatar)
      : DEFAULT_USER_AVATAR_URL;
  const visibleLastSeenAt = canSeeLastSeen ? payload?.updatedAt || null : null;

  return {
    ...payload,
    avatar: visibleAvatar || DEFAULT_USER_AVATAR_URL,
    online: canSeeOnline ? !!payload?.online : false,
    canSeeAvatar,
    canSeeOnline,
    canSeeLastSeen,
    // `updatedAt` is the source used for last-seen throughout the service. Do not
    // leave the raw timestamp in a sanitized profile when last-seen is hidden,
    // otherwise clients can reconstruct the protected presence value.
    updatedAt: visibleLastSeenAt,
    lastSeenAt: visibleLastSeenAt,
    presenceLabel: canSeeOnline && payload?.online
      ? 'online'
      : canSeeLastSeen
        ? 'last_seen'
        : 'hidden',
  };
};

const canViewerSeeStatus = ({ setting, isViewerContact = false, isSelf = false }) =>
  isSelf ||
  isVisibleByRule({
    rule: normalizePrivacySettingPayload(setting).statusVisibility,
    isContact: isViewerContact,
  });

const canUserAddToGroup = ({ setting, isContact = false, isSelf = false }) =>
  isSelf ||
  isVisibleByRule({
    rule: normalizePrivacySettingPayload(setting).groupsVisibility,
    isContact,
  });

const canReceiveUnknownMessage = ({ setting }) =>
  normalizePrivacySettingPayload(setting).messageRequestsEnabled;

const allowsReadReceipts = ({ setting }) =>
  normalizePrivacySettingPayload(setting).readReceiptsEnabled;

module.exports = {
  DEFAULT_PRIVACY,
  PRIVACY_OPTIONS,
  normalizePrivacyChoice,
  normalizePrivacySettingPayload,
  buildPrivacyContext,
  sanitizeProfileForViewer,
  canViewerSeeStatus,
  canUserAddToGroup,
  canReceiveUnknownMessage,
  allowsReadReceipts,
  getSettingMap,
  getContactMap,
};
