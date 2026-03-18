/* global __APP_IS_DEV__, __CHAT_UPLOAD_LIMIT_MB__, __AVATAR_UPLOAD_LIMIT_MB__ */

const isDev = typeof __APP_IS_DEV__ !== 'undefined' ? Boolean(__APP_IS_DEV__) : false;
const toMbBytes = (value, fallbackMb) => {
  const mb = Number(value || fallbackMb);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : fallbackMb * 1024 * 1024;
};

export default {
  isDev,
  apiBaseUrl: '/api',
  socketUrl: '/',
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
