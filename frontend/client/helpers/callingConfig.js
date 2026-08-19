import axios from 'axios';

const DEFAULT_CONFIG = {
  enabled: true,
  audioEnabled: true,
  videoEnabled: true,
  groupEnabled: true,
  maxGroupParticipants: 4,
  groupSfu: {
    enabled: false,
    provider: 'livekit',
    url: '',
    minParticipants: 3,
    adaptiveStream: true,
    dynacast: true,
  },
  ringingTimeoutSec: 45,
  reconnectGraceSec: 12,
  iceTransportPolicy: 'all',
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
  turnCredentialExpiresAt: null,
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
};

let cache = null;
let cacheAt = 0;
let pending = null;
const CACHE_TTL_MS = 30 * 1000;

const normalize = (payload = {}) => ({
  ...DEFAULT_CONFIG,
  ...payload,
  groupSfu: {
    ...DEFAULT_CONFIG.groupSfu,
    ...(payload.groupSfu || {}),
  },
  iceServers:
    Array.isArray(payload.iceServers) && payload.iceServers.length
      ? payload.iceServers
      : DEFAULT_CONFIG.iceServers,
  audioProfile: {
    ...DEFAULT_CONFIG.audioProfile,
    ...(payload.audioProfile || {}),
  },
  videoProfile: {
    ...DEFAULT_CONFIG.videoProfile,
    ...(payload.videoProfile || {}),
  },
});

export const clearCallingConfigCache = () => {
  cache = null;
  cacheAt = 0;
  pending = null;
};

export const getCallingConfig = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && cache && now - cacheAt < CACHE_TTL_MS) return cache;
  // A force refresh can bypass a completed cache, but it should still reuse an
  // in-flight request so the call gateway/runtime never duplicate the same HTTP
  // round trip during first-call initialization.
  if (pending) return pending;

  pending = axios
    .get('/calling/config', {
      headers: { 'Cache-Control': 'no-cache' },
    })
    .then((res) => {
      cache = normalize(res?.data?.payload || {});
      cacheAt = Date.now();
      return cache;
    })
    .finally(() => {
      pending = null;
    });

  return pending;
};

export const shouldUseGroupSfu = (config, participants = 0) => {
  const cfg = normalize(config || {});
  return (
    cfg.groupEnabled &&
    cfg.groupSfu?.enabled === true &&
    cfg.groupSfu?.provider === 'livekit' &&
    Number(participants || 0) >= Number(cfg.groupSfu?.minParticipants || 3)
  );
};

export const callAllowed = (
  config,
  { mediaType = 'audio', roomType = 'private', participants = 2 } = {}
) => {
  const cfg = normalize(config || {});
  if (!cfg.enabled) {
    return { allowed: false, message: 'Calling is disabled by the administrator' };
  }
  if (mediaType === 'video' && !cfg.videoEnabled) {
    return { allowed: false, message: 'Video calling is disabled by the administrator' };
  }
  if (mediaType !== 'video' && !cfg.audioEnabled) {
    return { allowed: false, message: 'Audio calling is disabled by the administrator' };
  }
  if (roomType === 'group' && !cfg.groupEnabled) {
    return { allowed: false, message: 'Group calling is disabled by the administrator' };
  }
  if (roomType === 'group' && participants > Number(cfg.maxGroupParticipants || 4)) {
    return {
      allowed: false,
      message: `Group calls are limited to ${cfg.maxGroupParticipants || 4} participants`,
    };
  }
  if (
    roomType === 'group' &&
    participants > 4 &&
    !shouldUseGroupSfu(cfg, participants)
  ) {
    return {
      allowed: false,
      message: 'Group calls above 4 participants require the admin-managed SFU service',
    };
  }
  return { allowed: true, message: '' };
};

export default getCallingConfig;
