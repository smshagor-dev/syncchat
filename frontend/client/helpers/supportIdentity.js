const SUPPORT_AVATAR = '/pwa-192x192.png';
const SUPPORT_USERNAME = 'syncchat_support';
const SUPPORT_EMAIL = 'support@syncchat.local';
const SUPPORT_NAME = 'SyncChat Support';

const isSupportIdentity = (value) => {
  if (!value || typeof value !== 'object') return false;

  return (
    String(value.username || '').toLowerCase() === SUPPORT_USERNAME ||
    String(value.email || '').toLowerCase() === SUPPORT_EMAIL ||
    String(value.fullname || '').trim() === SUPPORT_NAME
  );
};

const getSupportAwareAvatar = (value, fallback = '') => {
  if (isSupportIdentity(value)) return SUPPORT_AVATAR;
  return value?.avatar || fallback;
};

export { SUPPORT_AVATAR, SUPPORT_NAME, isSupportIdentity, getSupportAwareAvatar };
