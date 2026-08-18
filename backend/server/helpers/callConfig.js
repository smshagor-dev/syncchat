const crypto = require('crypto');
const AdminCallConfigModel = require('../db/models/adminCallConfig');

const DEFAULT_CALL_CONFIG = Object.freeze({
  enabled: true,
  audioEnabled: true,
  videoEnabled: true,
  groupEnabled: true,
  maxGroupParticipants: 12,
  groupSfu: {
    enabled: false,
    provider: 'livekit',
    url: '',
    apiKey: '',
    apiSecret: '',
    tokenTtlSec: 3600,
    minParticipants: 3,
    adaptiveStream: true,
    dynacast: true,
  },
  ringingTimeoutSec: 45,
  reconnectGraceSec: 12,
  iceTransportPolicy: 'all',
  stunUrls: ['stun:stun.l.google.com:19302'],
  turn: {
    enabled: false,
    urls: [],
    authMode: 'static',
    username: '',
    credential: '',
    sharedSecret: '',
    credentialTtlSec: 3600,
  },
  audioProfile: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  videoProfile: {
    width: 1280,
    height: 720,
    frameRate: 30,
    minWidth: 320,
    minHeight: 180,
    minFrameRate: 15,
    adaptive: true,
  },
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

const normalizeBoolean = (value, fallback) =>
  typeof value === 'boolean' ? value : fallback;

const normalizeIceTransportPolicy = (value) =>
  String(value || '').trim().toLowerCase() === 'relay' ? 'relay' : 'all';

const normalizeUrlList = (value, allowedSchemes) => {
  const input = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[\n,]+/)
        .map((item) => item.trim());

  return [...new Set(input.map((item) => String(item || '').trim()).filter(Boolean))]
    .filter((item) => {
      const scheme = item.split(':', 1)[0].toLowerCase();
      return allowedSchemes.includes(scheme);
    })
    .slice(0, 12);
};

const normalizeLiveKitUrl = (value) => {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (!/^(https?|wss?):\/\//i.test(raw)) return '';
  return raw.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
};

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
      'CALL_CONFIG_SECRET, STORAGE_CONFIG_SECRET, or JWT_SECRET is required to protect calling credentials'
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
    throw new Error('Stored calling credential is invalid');
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

const normalizeTurn = (raw = {}, { decrypt = true } = {}) => {
  const credentialRaw = String(raw.credential || '');
  const sharedSecretRaw = String(raw.sharedSecret || '');
  return {
    enabled: raw.enabled === true,
    urls: normalizeUrlList(raw.urls, ['turn', 'turns']),
    authMode:
      String(raw.authMode || '').trim().toLowerCase() === 'shared-secret'
        ? 'shared-secret'
        : 'static',
    username: String(raw.username || '').trim(),
    credential: decrypt ? decryptSecret(credentialRaw) : credentialRaw,
    sharedSecret: decrypt ? decryptSecret(sharedSecretRaw) : sharedSecretRaw,
    credentialTtlSec: clamp(raw.credentialTtlSec, 300, 86400, 3600),
  };
};

const normalizeGroupSfu = (raw = {}, { decrypt = true } = {}) => {
  const apiSecretRaw = String(raw.apiSecret || '');
  return {
    enabled: raw.enabled === true,
    provider: 'livekit',
    url: normalizeLiveKitUrl(raw.url),
    apiKey: String(raw.apiKey || '').trim(),
    apiSecret: decrypt ? decryptSecret(apiSecretRaw) : apiSecretRaw,
    tokenTtlSec: clamp(raw.tokenTtlSec, 300, 21600, 3600),
    minParticipants: clamp(raw.minParticipants, 3, 100, 3),
    adaptiveStream: normalizeBoolean(raw.adaptiveStream, true),
    dynacast: normalizeBoolean(raw.dynacast, true),
  };
};

const normalizeCallConfig = (raw = {}, { decrypt = true } = {}) => ({
  enabled: normalizeBoolean(raw.enabled, true),
  audioEnabled: normalizeBoolean(raw.audioEnabled, true),
  videoEnabled: normalizeBoolean(raw.videoEnabled, true),
  groupEnabled: normalizeBoolean(raw.groupEnabled, true),
  maxGroupParticipants: clamp(raw.maxGroupParticipants, 2, 100, 12),
  groupSfu: normalizeGroupSfu(raw.groupSfu || {}, { decrypt }),
  ringingTimeoutSec: clamp(raw.ringingTimeoutSec, 10, 120, 45),
  reconnectGraceSec: clamp(raw.reconnectGraceSec, 3, 60, 12),
  iceTransportPolicy: normalizeIceTransportPolicy(raw.iceTransportPolicy),
  stunUrls: normalizeUrlList(raw.stunUrls, ['stun', 'stuns']),
  turn: normalizeTurn(raw.turn || {}, { decrypt }),
  audioProfile: {
    echoCancellation: normalizeBoolean(raw.audioProfile?.echoCancellation, true),
    noiseSuppression: normalizeBoolean(raw.audioProfile?.noiseSuppression, true),
    autoGainControl: normalizeBoolean(raw.audioProfile?.autoGainControl, true),
  },
  videoProfile: {
    width: clamp(raw.videoProfile?.width, 320, 1920, 1280),
    height: clamp(raw.videoProfile?.height, 180, 1080, 720),
    frameRate: clamp(raw.videoProfile?.frameRate, 10, 60, 30),
    minWidth: clamp(raw.videoProfile?.minWidth, 160, 1280, 320),
    minHeight: clamp(raw.videoProfile?.minHeight, 90, 720, 180),
    minFrameRate: clamp(raw.videoProfile?.minFrameRate, 5, 30, 15),
    adaptive: normalizeBoolean(raw.videoProfile?.adaptive, true),
  },
  lastTestedAt: raw.lastTestedAt || null,
  lastTestStatus: String(raw.lastTestStatus || 'never'),
  lastTestMessage: String(raw.lastTestMessage || ''),
});

const validateCallConfig = (config) => {
  if (!config.enabled) return;
  if (!config.audioEnabled && !config.videoEnabled) {
    throw new Error('At least audio or video calling must be enabled');
  }
  if (config.stunUrls.length === 0 && !config.turn.enabled && !config.groupSfu.enabled) {
    throw new Error('At least one STUN, TURN, or SFU service is required');
  }
  if (config.turn.enabled) {
    if (config.turn.urls.length === 0) {
      throw new Error('At least one TURN URL is required when TURN is enabled');
    }
    if (config.turn.authMode === 'static') {
      if (!config.turn.username) throw new Error('TURN username is required');
      if (!config.turn.credential) throw new Error('TURN credential is required');
    } else if (!config.turn.sharedSecret) {
      throw new Error('TURN shared secret is required');
    }
  }
  if (config.groupSfu.enabled) {
    if (!config.groupEnabled) throw new Error('Group calling must be enabled before SFU mode');
    if (!config.groupSfu.url) throw new Error('LiveKit server URL is required');
    if (!config.groupSfu.apiKey) throw new Error('LiveKit API key is required');
    if (!config.groupSfu.apiSecret) throw new Error('LiveKit API secret is required');
    if (config.groupSfu.minParticipants > config.maxGroupParticipants) {
      throw new Error('SFU minimum participants cannot exceed the group participant limit');
    }
  }
};

const loadRow = async () => {
  const [row] = await AdminCallConfigModel.findOrCreate({
    where: {},
    defaults: DEFAULT_CALL_CONFIG,
  });
  return row;
};

const refreshCallConfigCache = () => {
  cached = null;
  cachedAt = 0;
};

const getCallConfig = async () => {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) {
    return {
      ...cached,
      turn: { ...cached.turn },
      groupSfu: { ...cached.groupSfu },
    };
  }
  const row = await loadRow();
  const plain = row?.get ? row.get({ plain: true }) : row;
  cached = normalizeCallConfig(plain || DEFAULT_CALL_CONFIG);
  cachedAt = now;
  return {
    ...cached,
    turn: { ...cached.turn },
    groupSfu: { ...cached.groupSfu },
  };
};

const getCallConfigForAdmin = async () => {
  const config = await getCallConfig();
  return {
    ...config,
    turn: {
      enabled: config.turn.enabled,
      urls: config.turn.urls,
      authMode: config.turn.authMode,
      username: config.turn.username,
      credentialTtlSec: config.turn.credentialTtlSec,
      credentialSet: Boolean(config.turn.credential),
      sharedSecretSet: Boolean(config.turn.sharedSecret),
    },
    groupSfu: {
      enabled: config.groupSfu.enabled,
      provider: 'livekit',
      url: config.groupSfu.url,
      apiKey: config.groupSfu.apiKey,
      tokenTtlSec: config.groupSfu.tokenTtlSec,
      minParticipants: config.groupSfu.minParticipants,
      adaptiveStream: config.groupSfu.adaptiveStream,
      dynacast: config.groupSfu.dynacast,
      apiSecretSet: Boolean(config.groupSfu.apiSecret),
    },
  };
};

const mergeCallConfigInput = async (raw = {}) => {
  const current = await getCallConfig();
  const turnInput = raw.turn || {};
  const sfuInput = raw.groupSfu || {};
  const hasCredential =
    Object.prototype.hasOwnProperty.call(turnInput, 'credential') &&
    String(turnInput.credential || '').length > 0;
  const hasSharedSecret =
    Object.prototype.hasOwnProperty.call(turnInput, 'sharedSecret') &&
    String(turnInput.sharedSecret || '').length > 0;
  const hasSfuSecret =
    Object.prototype.hasOwnProperty.call(sfuInput, 'apiSecret') &&
    String(sfuInput.apiSecret || '').length > 0;

  const next = normalizeCallConfig({
    ...current,
    ...raw,
    audioProfile: { ...current.audioProfile, ...(raw.audioProfile || {}) },
    videoProfile: { ...current.videoProfile, ...(raw.videoProfile || {}) },
    turn: {
      ...current.turn,
      ...turnInput,
      credential: hasCredential ? String(turnInput.credential) : current.turn.credential,
      sharedSecret: hasSharedSecret
        ? String(turnInput.sharedSecret)
        : current.turn.sharedSecret,
    },
    groupSfu: {
      ...current.groupSfu,
      ...sfuInput,
      apiSecret: hasSfuSecret ? String(sfuInput.apiSecret) : current.groupSfu.apiSecret,
    },
  });

  validateCallConfig(next);
  return next;
};

const saveCallConfig = async (raw = {}) => {
  const next = await mergeCallConfigInput(raw);
  const row = await loadRow();
  await row.update({
    enabled: next.enabled,
    audioEnabled: next.audioEnabled,
    videoEnabled: next.videoEnabled,
    groupEnabled: next.groupEnabled,
    maxGroupParticipants: next.maxGroupParticipants,
    groupSfu: {
      enabled: next.groupSfu.enabled,
      provider: 'livekit',
      url: next.groupSfu.url,
      apiKey: next.groupSfu.apiKey,
      apiSecret: encryptSecret(next.groupSfu.apiSecret),
      tokenTtlSec: next.groupSfu.tokenTtlSec,
      minParticipants: next.groupSfu.minParticipants,
      adaptiveStream: next.groupSfu.adaptiveStream,
      dynacast: next.groupSfu.dynacast,
    },
    ringingTimeoutSec: next.ringingTimeoutSec,
    reconnectGraceSec: next.reconnectGraceSec,
    iceTransportPolicy: next.iceTransportPolicy,
    stunUrls: next.stunUrls,
    turn: {
      enabled: next.turn.enabled,
      urls: next.turn.urls,
      authMode: next.turn.authMode,
      username: next.turn.username,
      credential: encryptSecret(next.turn.credential),
      sharedSecret: encryptSecret(next.turn.sharedSecret),
      credentialTtlSec: next.turn.credentialTtlSec,
    },
    audioProfile: next.audioProfile,
    videoProfile: next.videoProfile,
  });
  refreshCallConfigCache();
  return getCallConfigForAdmin();
};

const buildTurnCredential = (config, userId) => {
  if (!config.turn.enabled) return null;
  if (config.turn.authMode === 'static') {
    return {
      username: config.turn.username,
      credential: config.turn.credential,
      expiresAt: null,
    };
  }

  const expires = Math.floor(Date.now() / 1000) + config.turn.credentialTtlSec;
  const username = `${expires}:${String(userId || 'user')}`;
  const credential = crypto
    .createHmac('sha1', config.turn.sharedSecret)
    .update(username)
    .digest('base64');
  return {
    username,
    credential,
    expiresAt: new Date(expires * 1000).toISOString(),
  };
};

const getCallRuntimeConfig = async (userId) => {
  const config = await getCallConfig();
  const iceServers = [];
  if (config.stunUrls.length) iceServers.push({ urls: config.stunUrls });

  let turnCredentialExpiresAt = null;
  if (config.turn.enabled && config.turn.urls.length) {
    const turnCredential = buildTurnCredential(config, userId);
    turnCredentialExpiresAt = turnCredential?.expiresAt || null;
    iceServers.push({
      urls: config.turn.urls,
      username: turnCredential?.username || '',
      credential: turnCredential?.credential || '',
    });
  }

  return {
    enabled: config.enabled,
    audioEnabled: config.audioEnabled,
    videoEnabled: config.videoEnabled,
    groupEnabled: config.groupEnabled,
    maxGroupParticipants: config.maxGroupParticipants,
    groupSfu: {
      enabled: config.groupSfu.enabled,
      provider: 'livekit',
      url: config.groupSfu.url,
      minParticipants: config.groupSfu.minParticipants,
      adaptiveStream: config.groupSfu.adaptiveStream,
      dynacast: config.groupSfu.dynacast,
    },
    ringingTimeoutSec: config.ringingTimeoutSec,
    reconnectGraceSec: config.reconnectGraceSec,
    iceTransportPolicy: config.iceTransportPolicy,
    iceServers,
    turnCredentialExpiresAt,
    audioProfile: config.audioProfile,
    videoProfile: config.videoProfile,
  };
};

const markCallConfigTest = async ({ success, message }) => {
  const row = await loadRow();
  await row.update({
    lastTestedAt: new Date(),
    lastTestStatus: success ? 'success' : 'failed',
    lastTestMessage: String(message || '').slice(0, 500),
  });
  refreshCallConfigCache();
};

module.exports = {
  DEFAULT_CALL_CONFIG,
  normalizeCallConfig,
  validateCallConfig,
  getCallConfig,
  getCallConfigForAdmin,
  mergeCallConfigInput,
  saveCallConfig,
  getCallRuntimeConfig,
  markCallConfigTest,
  refreshCallConfigCache,
};
