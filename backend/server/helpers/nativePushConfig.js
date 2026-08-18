const crypto = require('crypto');
const AdminCallConfigModel = require('../db/models/adminCallConfig');

const DEFAULT_NATIVE_PUSH_CONFIG = Object.freeze({
  android: {
    enabled: false,
    projectId: '',
    clientEmail: '',
    privateKey: '',
  },
  ios: {
    enabled: false,
    teamId: '',
    keyId: '',
    bundleId: '',
    privateKey: '',
    environment: 'production',
  },
});

const secretMaterial = () =>
  String(
    process.env.CALL_CONFIG_SECRET ||
      process.env.STORAGE_CONFIG_SECRET ||
      process.env.JWT_SECRET ||
      ''
  ).trim();

const encryptionKey = () => {
  const secret = secretMaterial();
  if (!secret) {
    throw new Error(
      'CALL_CONFIG_SECRET, STORAGE_CONFIG_SECRET, or JWT_SECRET is required to protect native push credentials'
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
    throw new Error('Stored native push credential is invalid');
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

const normalizeEnvironment = (value) =>
  String(value || '').trim().toLowerCase() === 'sandbox' ? 'sandbox' : 'production';

const normalizeNativePushConfig = (raw = {}, { decrypt = true } = {}) => {
  const android = raw.android || {};
  const ios = raw.ios || {};
  const androidKey = String(android.privateKey || '');
  const iosKey = String(ios.privateKey || '');

  return {
    android: {
      enabled: android.enabled === true,
      projectId: String(android.projectId || '').trim(),
      clientEmail: String(android.clientEmail || '').trim(),
      privateKey: decrypt ? decryptSecret(androidKey) : androidKey,
    },
    ios: {
      enabled: ios.enabled === true,
      teamId: String(ios.teamId || '').trim(),
      keyId: String(ios.keyId || '').trim(),
      bundleId: String(ios.bundleId || '').trim(),
      privateKey: decrypt ? decryptSecret(iosKey) : iosKey,
      environment: normalizeEnvironment(ios.environment),
    },
  };
};

const validateNativePushConfig = (config) => {
  if (config.android.enabled) {
    if (!config.android.projectId) throw new Error('FCM project ID is required');
    if (!config.android.clientEmail) throw new Error('FCM client email is required');
    if (!config.android.privateKey) throw new Error('FCM private key is required');
  }

  if (config.ios.enabled) {
    if (!config.ios.teamId) throw new Error('APNs team ID is required');
    if (!config.ios.keyId) throw new Error('APNs key ID is required');
    if (!config.ios.bundleId) throw new Error('APNs bundle ID is required');
    if (!config.ios.privateKey) throw new Error('APNs private key is required');
  }
};

const loadRow = async () => {
  const [row] = await AdminCallConfigModel.findOrCreate({
    where: {},
    defaults: { nativePush: DEFAULT_NATIVE_PUSH_CONFIG },
  });
  return row;
};

const getNativePushConfig = async () => {
  const row = await loadRow();
  const plain = row?.get ? row.get({ plain: true }) : row;
  return normalizeNativePushConfig(plain?.nativePush || DEFAULT_NATIVE_PUSH_CONFIG);
};

const getNativePushConfigForAdmin = async () => {
  const config = await getNativePushConfig();
  return {
    android: {
      enabled: config.android.enabled,
      projectId: config.android.projectId,
      clientEmail: config.android.clientEmail,
      privateKeySet: Boolean(config.android.privateKey),
    },
    ios: {
      enabled: config.ios.enabled,
      teamId: config.ios.teamId,
      keyId: config.ios.keyId,
      bundleId: config.ios.bundleId,
      environment: config.ios.environment,
      privateKeySet: Boolean(config.ios.privateKey),
    },
  };
};

const saveNativePushConfig = async (raw = {}) => {
  const current = await getNativePushConfig();
  const androidInput = raw.android || {};
  const iosInput = raw.ios || {};
  const hasAndroidKey =
    Object.prototype.hasOwnProperty.call(androidInput, 'privateKey') &&
    String(androidInput.privateKey || '').trim().length > 0;
  const hasIosKey =
    Object.prototype.hasOwnProperty.call(iosInput, 'privateKey') &&
    String(iosInput.privateKey || '').trim().length > 0;

  const next = normalizeNativePushConfig({
    android: {
      ...current.android,
      ...androidInput,
      privateKey: hasAndroidKey ? String(androidInput.privateKey) : current.android.privateKey,
    },
    ios: {
      ...current.ios,
      ...iosInput,
      privateKey: hasIosKey ? String(iosInput.privateKey) : current.ios.privateKey,
    },
  });
  validateNativePushConfig(next);

  const row = await loadRow();
  await row.update({
    nativePush: {
      android: {
        enabled: next.android.enabled,
        projectId: next.android.projectId,
        clientEmail: next.android.clientEmail,
        privateKey: encryptSecret(next.android.privateKey),
      },
      ios: {
        enabled: next.ios.enabled,
        teamId: next.ios.teamId,
        keyId: next.ios.keyId,
        bundleId: next.ios.bundleId,
        privateKey: encryptSecret(next.ios.privateKey),
        environment: next.ios.environment,
      },
    },
  });

  return getNativePushConfigForAdmin();
};

module.exports = {
  DEFAULT_NATIVE_PUSH_CONFIG,
  normalizeNativePushConfig,
  validateNativePushConfig,
  getNativePushConfig,
  getNativePushConfigForAdmin,
  saveNativePushConfig,
};
