const crypto = require('crypto');
const AdminSocialAuthConfigModel = require('../db/models/adminSocialAuthConfig');

const DEFAULT_SOCIAL_AUTH_CONFIG = Object.freeze({
  google: {
    enabled: false,
    clientId: '',
    clientSecret: '',
  },
  facebook: {
    enabled: false,
    appId: '',
    appSecret: '',
  },
  // Telegram is retained only for legacy server-side compatibility. It is not
  // exposed to web/mobile configuration surfaces and cannot be configured from
  // the browser anymore.
  telegram: {
    enabled: false,
    botUsername: '',
    botToken: '',
  },
});

const CACHE_TTL_MS = 30 * 1000;
let cachedConfig = null;
let cachedAt = 0;

const secretMaterial = () =>
  String(
    process.env.SOCIAL_AUTH_CONFIG_SECRET ||
      process.env.CALL_CONFIG_SECRET ||
      process.env.STORAGE_CONFIG_SECRET ||
      process.env.JWT_SECRET ||
      ''
  ).trim();

const encryptionKey = () => {
  const secret = secretMaterial();
  if (!secret) {
    throw new Error(
      'SOCIAL_AUTH_CONFIG_SECRET, CALL_CONFIG_SECRET, STORAGE_CONFIG_SECRET, or JWT_SECRET is required to protect social auth credentials'
    );
  }
  return crypto.createHash('sha256').update(secret).digest();
};

const encryptSecret = (value) => {
  const plain = String(value || '');
  if (!plain) return '';
  if (plain.startsWith('enc:v1:')) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
};

const decryptSecret = (value) => {
  const stored = String(value || '');
  if (!stored) return '';
  if (!stored.startsWith('enc:v1:')) return stored;
  const [, version, ivB64, tagB64, dataB64] = stored.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Stored social auth credential is invalid');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivB64, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

const cleanBotUsername = (value) =>
  String(value || '')
    .trim()
    .replace(/^@+/, '');

const normalizeSocialAuthConfig = (raw = {}, { decrypt = true } = {}) => {
  const google = raw.google && typeof raw.google === 'object' ? raw.google : {};
  const facebook = raw.facebook && typeof raw.facebook === 'object' ? raw.facebook : {};
  const telegram = raw.telegram && typeof raw.telegram === 'object' ? raw.telegram : {};

  const googleSecret = String(google.clientSecret || '');
  const facebookSecret = String(facebook.appSecret || '');
  const telegramToken = String(telegram.botToken || '');

  return {
    google: {
      enabled: google.enabled === true,
      clientId: String(google.clientId || '').trim(),
      clientSecret: decrypt ? decryptSecret(googleSecret) : googleSecret,
    },
    facebook: {
      enabled: facebook.enabled === true,
      appId: String(facebook.appId || '').trim(),
      appSecret: decrypt ? decryptSecret(facebookSecret) : facebookSecret,
    },
    telegram: {
      enabled: telegram.enabled === true,
      botUsername: cleanBotUsername(telegram.botUsername),
      botToken: decrypt ? decryptSecret(telegramToken) : telegramToken,
    },
  };
};

const validateSocialAuthConfig = (config) => {
  if (config.google.enabled) {
    if (!config.google.clientId) {
      throw new Error('Google Client ID is required when Google login is enabled');
    }
  }

  if (config.facebook.enabled) {
    if (!config.facebook.appId) {
      throw new Error('Facebook App ID is required when Facebook login is enabled');
    }
    if (!config.facebook.appSecret) {
      throw new Error('Facebook App Secret is required when Facebook login is enabled');
    }
  }

  if (config.telegram.enabled) {
    if (!config.telegram.botUsername) {
      throw new Error('Telegram bot username is required when Telegram login is enabled');
    }
    if (!config.telegram.botToken) {
      throw new Error('Telegram bot token is required when Telegram login is enabled');
    }
  }
};

const loadRow = async () => {
  const [row] = await AdminSocialAuthConfigModel.findOrCreate({
    where: {},
    defaults: DEFAULT_SOCIAL_AUTH_CONFIG,
  });
  return row;
};

const refreshSocialAuthConfigCache = () => {
  cachedConfig = null;
  cachedAt = 0;
};

const getSocialAuthConfig = async () => {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL_MS) return cachedConfig;

  const row = await loadRow();
  const plain = row?.get ? row.get({ plain: true }) : row;
  cachedConfig = normalizeSocialAuthConfig(plain || DEFAULT_SOCIAL_AUTH_CONFIG);
  cachedAt = now;
  return cachedConfig;
};

const getSocialAuthConfigForAdmin = async () => {
  const config = await getSocialAuthConfig();
  return {
    google: {
      enabled: config.google.enabled,
      clientId: config.google.clientId,
      clientSecretSet: Boolean(config.google.clientSecret),
    },
    facebook: {
      enabled: config.facebook.enabled,
      appId: config.facebook.appId,
      appSecretSet: Boolean(config.facebook.appSecret),
    },
  };
};

const getPublicSocialAuthConfig = async () => {
  const config = await getSocialAuthConfig();
  return {
    googleClientId: config.google.enabled ? config.google.clientId : '',
    facebookAppId: config.facebook.enabled ? config.facebook.appId : '',
  };
};

const saveSocialAuthConfig = async (raw = {}) => {
  const current = await getSocialAuthConfig();
  const googleInput = raw.google && typeof raw.google === 'object' ? raw.google : {};
  const facebookInput = raw.facebook && typeof raw.facebook === 'object' ? raw.facebook : {};

  const hasGoogleSecret =
    Object.prototype.hasOwnProperty.call(googleInput, 'clientSecret') &&
    String(googleInput.clientSecret || '').trim().length > 0;
  const hasFacebookSecret =
    Object.prototype.hasOwnProperty.call(facebookInput, 'appSecret') &&
    String(facebookInput.appSecret || '').trim().length > 0;

  const next = normalizeSocialAuthConfig({
    google: {
      ...current.google,
      ...googleInput,
      clientSecret: hasGoogleSecret
        ? String(googleInput.clientSecret)
        : current.google.clientSecret,
    },
    facebook: {
      ...current.facebook,
      ...facebookInput,
      appSecret: hasFacebookSecret
        ? String(facebookInput.appSecret)
        : current.facebook.appSecret,
    },
    // Browser/admin updates must never re-enable or mutate Telegram. Existing
    // legacy values remain untouched server-side for compatibility/migration.
    telegram: current.telegram,
  });

  validateSocialAuthConfig(next);

  const row = await loadRow();
  await row.update({
    google: {
      enabled: next.google.enabled,
      clientId: next.google.clientId,
      clientSecret: encryptSecret(next.google.clientSecret),
    },
    facebook: {
      enabled: next.facebook.enabled,
      appId: next.facebook.appId,
      appSecret: encryptSecret(next.facebook.appSecret),
    },
    telegram: {
      enabled: next.telegram.enabled,
      botUsername: next.telegram.botUsername,
      botToken: encryptSecret(next.telegram.botToken),
    },
  });
  refreshSocialAuthConfigCache();
  return getSocialAuthConfigForAdmin();
};

module.exports = {
  DEFAULT_SOCIAL_AUTH_CONFIG,
  normalizeSocialAuthConfig,
  validateSocialAuthConfig,
  getSocialAuthConfig,
  getSocialAuthConfigForAdmin,
  getPublicSocialAuthConfig,
  saveSocialAuthConfig,
  refreshSocialAuthConfigCache,
};
