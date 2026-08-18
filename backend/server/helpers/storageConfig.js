const crypto = require('crypto');
const path = require('path');
const AdminStorageConfigModel = require('../db/models/adminStorageConfig');

const DEFAULT_STORAGE_CONFIG = Object.freeze({
  provider: 'ftp',
  enabled: false,
  host: '',
  port: 21,
  secureMode: 'none',
  user: '',
  password: '',
  basePath: '/uploads',
  publicBaseUrl: '',
  rejectUnauthorized: true,
  timeoutMs: 15000,
  lastTestedAt: null,
  lastTestStatus: 'never',
  lastTestMessage: '',
});

const CACHE_TTL_MS = 30 * 1000;
let cached = null;
let cachedAt = 0;

const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

const normalizeSecureMode = (value) => {
  const mode = String(value || '').trim().toLowerCase();
  return ['none', 'explicit', 'implicit'].includes(mode) ? mode : 'none';
};

const normalizeBasePath = (value) => {
  const raw = String(value || '/uploads').trim().replace(/\\/g, '/');
  const normalized = path.posix.normalize(`/${raw.replace(/^\/+/, '')}`);
  return normalized === '/' ? '/uploads' : normalized.replace(/\/+$/, '');
};

const normalizePublicBaseUrl = (value) => {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error0) {
    throw new Error('Public base URL must be a valid http(s) URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Public base URL must use http or https');
  }
  return parsed.toString().replace(/\/+$/, '');
};

const secretMaterial = () =>
  String(process.env.STORAGE_CONFIG_SECRET || process.env.JWT_SECRET || '').trim();

const encryptionKey = () => {
  const secret = secretMaterial();
  if (!secret) {
    throw new Error(
      'STORAGE_CONFIG_SECRET or JWT_SECRET is required to protect FTP credentials'
    );
  }
  return crypto.createHash('sha256').update(secret).digest();
};

const encryptPassword = (value) => {
  const plain = String(value || '');
  if (!plain) return '';
  if (plain.startsWith('enc:v1:')) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
};

const decryptPassword = (value) => {
  const stored = String(value || '');
  if (!stored) return '';
  if (!stored.startsWith('enc:v1:')) return stored;
  const [, version, ivB64, tagB64, dataB64] = stored.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Stored FTP credential is invalid');
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

const normalizeStorageConfig = (raw = {}, { decrypt = true } = {}) => ({
  provider: 'ftp',
  enabled: raw.enabled === true,
  host: String(raw.host || '').trim(),
  port: clamp(raw.port, 1, 65535, 21),
  secureMode: normalizeSecureMode(raw.secureMode),
  user: String(raw.user || '').trim(),
  password: decrypt ? decryptPassword(raw.password) : String(raw.password || ''),
  basePath: normalizeBasePath(raw.basePath),
  publicBaseUrl: raw.publicBaseUrl
    ? normalizePublicBaseUrl(raw.publicBaseUrl)
    : '',
  rejectUnauthorized:
    typeof raw.rejectUnauthorized === 'boolean' ? raw.rejectUnauthorized : true,
  timeoutMs: clamp(raw.timeoutMs, 3000, 120000, 15000),
  lastTestedAt: raw.lastTestedAt || null,
  lastTestStatus: String(raw.lastTestStatus || 'never'),
  lastTestMessage: String(raw.lastTestMessage || ''),
});

const loadRow = async () => {
  const [row] = await AdminStorageConfigModel.findOrCreate({
    where: {},
    defaults: DEFAULT_STORAGE_CONFIG,
  });
  return row;
};

const refreshStorageConfigCache = () => {
  cached = null;
  cachedAt = 0;
};

const getStorageConfig = async () => {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return { ...cached };
  const row = await loadRow();
  const plain = row?.get ? row.get({ plain: true }) : row;
  cached = normalizeStorageConfig(plain || DEFAULT_STORAGE_CONFIG);
  cachedAt = now;
  return { ...cached };
};

const getStorageConfigForAdmin = async () => {
  const config = await getStorageConfig();
  const { password, ...safe } = config;
  return {
    ...safe,
    passwordSet: Boolean(password),
  };
};

const validateEnabledConfig = (config) => {
  if (!config.enabled) return;
  if (!config.host) throw new Error('FTP host is required');
  if (!config.user) throw new Error('FTP username is required');
  if (!config.password) throw new Error('FTP password is required');
  if (!config.publicBaseUrl) {
    throw new Error('Public base URL is required when FTP storage is enabled');
  }
};

const mergeStorageInput = async (raw = {}) => {
  const current = await getStorageConfig();
  const hasPassword =
    Object.prototype.hasOwnProperty.call(raw, 'password') &&
    String(raw.password || '').length > 0;
  const next = normalizeStorageConfig({
    ...current,
    ...raw,
    password: hasPassword ? String(raw.password) : current.password,
  });
  validateEnabledConfig(next);
  return next;
};

const saveStorageConfig = async (raw = {}) => {
  const next = await mergeStorageInput(raw);
  const row = await loadRow();
  await row.update({
    provider: 'ftp',
    enabled: next.enabled,
    host: next.host,
    port: next.port,
    secureMode: next.secureMode,
    user: next.user,
    password: encryptPassword(next.password),
    basePath: next.basePath,
    publicBaseUrl: next.publicBaseUrl,
    rejectUnauthorized: next.rejectUnauthorized,
    timeoutMs: next.timeoutMs,
  });
  refreshStorageConfigCache();
  return getStorageConfigForAdmin();
};

const markStorageTest = async ({ success, message }) => {
  const row = await loadRow();
  await row.update({
    lastTestedAt: new Date(),
    lastTestStatus: success ? 'success' : 'failed',
    lastTestMessage: String(message || '').slice(0, 500),
  });
  refreshStorageConfigCache();
};

module.exports = {
  DEFAULT_STORAGE_CONFIG,
  normalizeStorageConfig,
  getStorageConfig,
  getStorageConfigForAdmin,
  mergeStorageInput,
  saveStorageConfig,
  markStorageTest,
  refreshStorageConfigCache,
};
