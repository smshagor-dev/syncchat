const AdminAppConfigModel = require('../db/models/adminAppConfig');
const { asArray } = require('../db/utils');
const { DEFAULT_PRIVACY, normalizePrivacySettingPayload } = require('./privacy');
const {
  encryptSmtpSecret,
  isEncryptedSmtpSecret,
} = require('./smtpSecret');

const DEFAULT_APP_CONFIG = {
  appName: 'SyncChat',
  appLogo: '',
  supportEmail: '',
  smtp: {
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    fromName: '',
    fromEmail: '',
  },
  featureFlags: {
    uploads: true,
    status: true,
    calls: true,
    groups: true,
    channels: true,
    communities: true,
  },
  defaultPrivacy: { ...DEFAULT_PRIVACY },
  defaultChat: {
    enterToSend: true,
    mediaQuality: 'standard',
    autoDownloadPhotos: true,
    autoDownloadAudio: true,
    autoDownloadVideos: true,
    autoDownloadDocuments: false,
    spellCheckEnabled: true,
    replaceTextWithEmoji: true,
    keepArchived: false,
  },
  defaultNotifications: {
    showNotificationBanner: true,
    showPopupNotification: true,
    showPushNotification: true,
    notifyMessages: true,
    notifyGroups: true,
    notifyStatus: true,
    notifyCalls: true,
    showNotificationPreviews: true,
    outgoingMessageSoundEnabled: true,
  },
  uploadLimits: {
    chatMb: 100,
    avatarMb: 10,
    allowedTypes: ['image', 'video', 'audio', 'document'],
  },
  mediaProfile: {
    defaultQuality: 'standard',
    hdEnabled: true,
  },
  maintenance: {
    enabled: false,
    message: '',
  },
  seo: {
    title: '',
    description: '',
    keywords: '',
    image: '',
    ogType: 'website',
    twitterCard: 'summary_large_image',
  },
};

const CACHE_TTL_MS = 60 * 1000;
let cachedConfig = null;
let cachedAt = 0;

const clampNumber = (value, { min, max, fallback }) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
};

const normalizeBooleanMap = (raw = {}, defaults = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const output = { ...defaults };
  Object.entries(source).forEach(([key, value]) => {
    if (typeof value === 'boolean') {
      output[key] = value;
    } else if (!(key in output)) {
      output[key] = Boolean(value);
    }
  });
  return output;
};

const normalizeUploadLimits = (raw = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const allowedTypes = asArray(source.allowedTypes)
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  const safeAllowed = allowedTypes.filter((item) =>
    DEFAULT_APP_CONFIG.uploadLimits.allowedTypes.includes(item)
  );
  const hasAllowedInput = Object.prototype.hasOwnProperty.call(source, 'allowedTypes');

  return {
    chatMb: clampNumber(source.chatMb, { min: 1, max: 2048, fallback: 100 }),
    avatarMb: clampNumber(source.avatarMb, { min: 1, max: 200, fallback: 10 }),
    allowedTypes: hasAllowedInput
      ? safeAllowed
      : DEFAULT_APP_CONFIG.uploadLimits.allowedTypes,
  };
};

const normalizeMediaProfile = (raw = {}) => ({
  defaultQuality:
    String(raw.defaultQuality || '').toLowerCase() === 'hd' ? 'hd' : 'standard',
  hdEnabled:
    typeof raw.hdEnabled === 'boolean'
      ? raw.hdEnabled
      : DEFAULT_APP_CONFIG.mediaProfile.hdEnabled,
});

const normalizeSmtp = (raw = {}, fallback = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    host: String(source.host ?? fallback.host ?? '').trim(),
    port: clampNumber(source.port ?? fallback.port ?? 587, {
      min: 1,
      max: 65535,
      fallback: 587,
    }),
    secure:
      typeof source.secure === 'boolean'
        ? source.secure
        : Boolean(fallback.secure),
    user: String(source.user ?? fallback.user ?? '').trim(),
    pass:
      source.pass !== undefined
        ? String(source.pass || '')
        : String(fallback.pass || ''),
    fromName: String(source.fromName ?? fallback.fromName ?? '').trim(),
    fromEmail: String(source.fromEmail ?? fallback.fromEmail ?? '').trim(),
  };
};

const normalizeDefaultChat = (raw = {}) => ({
  enterToSend:
    typeof raw.enterToSend === 'boolean'
      ? raw.enterToSend
      : DEFAULT_APP_CONFIG.defaultChat.enterToSend,
  mediaQuality:
    String(raw.mediaQuality || '').toLowerCase() === 'hd' ? 'hd' : 'standard',
  autoDownloadPhotos:
    typeof raw.autoDownloadPhotos === 'boolean'
      ? raw.autoDownloadPhotos
      : DEFAULT_APP_CONFIG.defaultChat.autoDownloadPhotos,
  autoDownloadAudio:
    typeof raw.autoDownloadAudio === 'boolean'
      ? raw.autoDownloadAudio
      : DEFAULT_APP_CONFIG.defaultChat.autoDownloadAudio,
  autoDownloadVideos:
    typeof raw.autoDownloadVideos === 'boolean'
      ? raw.autoDownloadVideos
      : DEFAULT_APP_CONFIG.defaultChat.autoDownloadVideos,
  autoDownloadDocuments:
    typeof raw.autoDownloadDocuments === 'boolean'
      ? raw.autoDownloadDocuments
      : DEFAULT_APP_CONFIG.defaultChat.autoDownloadDocuments,
  spellCheckEnabled:
    typeof raw.spellCheckEnabled === 'boolean'
      ? raw.spellCheckEnabled
      : DEFAULT_APP_CONFIG.defaultChat.spellCheckEnabled,
  replaceTextWithEmoji:
    typeof raw.replaceTextWithEmoji === 'boolean'
      ? raw.replaceTextWithEmoji
      : DEFAULT_APP_CONFIG.defaultChat.replaceTextWithEmoji,
  keepArchived:
    typeof raw.keepArchived === 'boolean'
      ? raw.keepArchived
      : DEFAULT_APP_CONFIG.defaultChat.keepArchived,
});

const normalizeDefaultNotifications = (raw = {}) => ({
  showNotificationBanner:
    typeof raw.showNotificationBanner === 'boolean'
      ? raw.showNotificationBanner
      : DEFAULT_APP_CONFIG.defaultNotifications.showNotificationBanner,
  showPopupNotification:
    typeof raw.showPopupNotification === 'boolean'
      ? raw.showPopupNotification
      : DEFAULT_APP_CONFIG.defaultNotifications.showPopupNotification,
  showPushNotification:
    typeof raw.showPushNotification === 'boolean'
      ? raw.showPushNotification
      : DEFAULT_APP_CONFIG.defaultNotifications.showPushNotification,
  notifyMessages:
    typeof raw.notifyMessages === 'boolean'
      ? raw.notifyMessages
      : DEFAULT_APP_CONFIG.defaultNotifications.notifyMessages,
  notifyGroups:
    typeof raw.notifyGroups === 'boolean'
      ? raw.notifyGroups
      : DEFAULT_APP_CONFIG.defaultNotifications.notifyGroups,
  notifyStatus:
    typeof raw.notifyStatus === 'boolean'
      ? raw.notifyStatus
      : DEFAULT_APP_CONFIG.defaultNotifications.notifyStatus,
  notifyCalls:
    typeof raw.notifyCalls === 'boolean'
      ? raw.notifyCalls
      : DEFAULT_APP_CONFIG.defaultNotifications.notifyCalls,
  showNotificationPreviews:
    typeof raw.showNotificationPreviews === 'boolean'
      ? raw.showNotificationPreviews
      : DEFAULT_APP_CONFIG.defaultNotifications.showNotificationPreviews,
  outgoingMessageSoundEnabled:
    typeof raw.outgoingMessageSoundEnabled === 'boolean'
      ? raw.outgoingMessageSoundEnabled
      : DEFAULT_APP_CONFIG.defaultNotifications.outgoingMessageSoundEnabled,
});

const normalizeMaintenance = (raw = {}) => ({
  enabled:
    typeof raw.enabled === 'boolean'
      ? raw.enabled
      : DEFAULT_APP_CONFIG.maintenance.enabled,
  message: String(raw.message || '').trim().slice(0, 240),
});

const normalizeSeo = (raw = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const ogType = String(source.ogType || '').trim().toLowerCase();
  const twitterCard = String(source.twitterCard || '').trim().toLowerCase();
  const allowedOg = ['website', 'article', 'profile'];
  const allowedTwitter = ['summary', 'summary_large_image'];
  return {
    title: String(source.title || '').trim().slice(0, 120),
    description: String(source.description || '').trim().slice(0, 320),
    keywords: String(source.keywords || '').trim().slice(0, 240),
    image: String(source.image || '').trim().slice(0, 512),
    ogType: allowedOg.includes(ogType) ? ogType : 'website',
    twitterCard: allowedTwitter.includes(twitterCard)
      ? twitterCard
      : 'summary_large_image',
  };
};

const normalizeAppConfig = (raw = {}, fallback = DEFAULT_APP_CONFIG) => ({
  appName: String(raw.appName || fallback.appName || 'SyncChat').trim().slice(0, 80),
  appLogo: String(raw.appLogo || fallback.appLogo || '').trim().slice(0, 512),
  supportEmail: String(raw.supportEmail || fallback.supportEmail || '').trim(),
  smtp: normalizeSmtp(raw.smtp, fallback.smtp),
  featureFlags: normalizeBooleanMap(raw.featureFlags, fallback.featureFlags),
  defaultPrivacy: normalizePrivacySettingPayload(
    raw.defaultPrivacy || fallback.defaultPrivacy || DEFAULT_PRIVACY
  ),
  defaultChat: normalizeDefaultChat(raw.defaultChat || fallback.defaultChat || {}),
  defaultNotifications: normalizeDefaultNotifications(
    raw.defaultNotifications || fallback.defaultNotifications || {}
  ),
  uploadLimits: normalizeUploadLimits(raw.uploadLimits || fallback.uploadLimits || {}),
  mediaProfile: normalizeMediaProfile(raw.mediaProfile || fallback.mediaProfile || {}),
  maintenance: normalizeMaintenance(raw.maintenance || fallback.maintenance || {}),
  seo: normalizeSeo(raw.seo || fallback.seo || {}),
});

const migrateLegacySmtpSecret = async (row, plain) => {
  const smtp = plain?.smtp && typeof plain.smtp === 'object' ? plain.smtp : null;
  const pass = String(smtp?.pass || '');
  if (!smtp || !pass || isEncryptedSmtpSecret(pass)) return plain;

  const encryptedPass = encryptSmtpSecret(pass);
  const migratedSmtp = { ...smtp, pass: encryptedPass };
  await row.update({ smtp: migratedSmtp });
  return { ...plain, smtp: migratedSmtp };
};

const loadAppConfig = async () => {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL_MS) return cachedConfig;

  const [row] = await AdminAppConfigModel.findOrCreate({
    where: {},
    defaults: DEFAULT_APP_CONFIG,
  });

  const initialPlain = row?.get ? row.get({ plain: true }) : row;
  const plain = await migrateLegacySmtpSecret(
    row,
    initialPlain || DEFAULT_APP_CONFIG
  );
  cachedConfig = normalizeAppConfig(plain || DEFAULT_APP_CONFIG);
  cachedAt = now;
  return cachedConfig;
};

const refreshAppConfigCache = () => {
  cachedConfig = null;
  cachedAt = 0;
};

const getPublicAppConfig = async () => {
  const config = await loadAppConfig();
  return {
    appName: config.appName,
    appLogo: config.appLogo,
    supportEmail: config.supportEmail,
    featureFlags: config.featureFlags,
    uploadLimits: config.uploadLimits,
    mediaProfile: config.mediaProfile,
    maintenance: config.maintenance,
    seo: config.seo,
  };
};

const applyDefaultSettings = async ({ userId }) => {
  const config = await loadAppConfig();
  const defaults = {
    ...config.defaultPrivacy,
    ...config.defaultChat,
    ...config.defaultNotifications,
  };

  return {
    userId,
    ...defaults,
    mediaQuality:
      String(config.mediaProfile?.defaultQuality || '').toLowerCase() === 'hd'
        ? 'hd'
        : defaults.mediaQuality || 'standard',
  };
};

module.exports = {
  DEFAULT_APP_CONFIG,
  normalizeAppConfig,
  loadAppConfig,
  refreshAppConfigCache,
  getPublicAppConfig,
  applyDefaultSettings,
};
