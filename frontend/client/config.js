/* global __APP_IS_DEV__, __API_BASE_URL__, __SOCKET_URL__, __PUBLIC_ORIGIN__, __CLIENT_API_BASE_URL__, __CLIENT_SOCKET_URL__, __CLIENT_PUBLIC_ORIGIN__, __CHAT_UPLOAD_LIMIT_MB__, __AVATAR_UPLOAD_LIMIT_MB__ */

const isDev = typeof __APP_IS_DEV__ !== 'undefined' ? Boolean(__APP_IS_DEV__) : false;
const configuredApiBaseUrl =
  typeof __CLIENT_API_BASE_URL__ !== 'undefined'
    ? String(__CLIENT_API_BASE_URL__ || '').trim()
    : typeof __API_BASE_URL__ !== 'undefined'
      ? String(__API_BASE_URL__ || '').trim()
      : '';
const configuredSocketUrl =
  typeof __CLIENT_SOCKET_URL__ !== 'undefined'
    ? String(__CLIENT_SOCKET_URL__ || '').trim()
    : typeof __SOCKET_URL__ !== 'undefined'
      ? String(__SOCKET_URL__ || '').trim()
      : '';
const configuredPublicOrigin =
  typeof __CLIENT_PUBLIC_ORIGIN__ !== 'undefined'
    ? String(__CLIENT_PUBLIC_ORIGIN__ || '').trim()
    : typeof __PUBLIC_ORIGIN__ !== 'undefined'
      ? String(__PUBLIC_ORIGIN__ || '').trim()
      : '';
const toMbBytes = (value, fallbackMb) => {
  const mb = Number(value || fallbackMb);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : fallbackMb * 1024 * 1024;
};
const getOrigin = (value) => {
  if (!value) return '';

  try {
    return new URL(value, window.location.origin).origin;
  } catch (error0) {
    return '';
  }
};
const isFirstPartyProductionWeb = (() => {
  if (isDev || typeof window === 'undefined') return false;
  const hostname = String(window.location.hostname || '').toLowerCase();
  return hostname === 'syncchat.live' || hostname === 'www.syncchat.live';
})();

// On the public production web app, keep HTTP requests same-origin and let
// Vercel proxy /api/* to api.syncchat.live. This avoids browser CORS/preflight
// failures while Socket.IO can continue using its dedicated configured origin.
const apiBaseUrl = isFirstPartyProductionWeb ? '/api' : configuredApiBaseUrl || '/api';
const socketUrl = configuredSocketUrl || '/';
const publicOrigin = configuredPublicOrigin || getOrigin(apiBaseUrl) || '';

export default {
  isDev,
  apiBaseUrl,
  socketUrl,
  publicOrigin,
  brandName: 'SyncChat',
  brandLogo: '',
  supportEmail: '',
  seo: {
    title: '',
    description: '',
    keywords: '',
    image: '',
    ogType: 'website',
    twitterCard: 'summary_large_image',
  },
  featureFlags: {
    uploads: true,
    status: true,
    calls: true,
    groups: true,
    channels: true,
    communities: true,
  },
  avatarUploadLimit: toMbBytes(
    typeof __AVATAR_UPLOAD_LIMIT_MB__ !== 'undefined'
      ? __AVATAR_UPLOAD_LIMIT_MB__
      : 10,
    10
  ),
  chatUploadLimit: toMbBytes(
    typeof __CHAT_UPLOAD_LIMIT_MB__ !== 'undefined'
      ? __CHAT_UPLOAD_LIMIT_MB__
      : 100,
    100
  ),
  uploadAllowedTypes: ['image', 'video', 'audio', 'document'],
  maintenance: {
    enabled: false,
    message: '',
  },
};
