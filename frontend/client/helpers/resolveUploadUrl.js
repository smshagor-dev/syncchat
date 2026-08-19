import config from '../config';

const isLocalHostname = (hostname = '') =>
  ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase());

const LEGACY_AVATAR_FALLBACKS = [
  {
    match: /(?:default-group-avatar\.png|\/assets\/icons\/group-avatar\.svg)(?:[?#].*)?$/i,
    target: '/assets/icons/group-avatar.svg',
  },
  {
    match: /(?:default-channel-avatar\.png|\/assets\/icons\/channel-avatar\.svg)(?:[?#].*)?$/i,
    target: '/assets/icons/channel-avatar.svg',
  },
  {
    match: /(?:default-avatar\.png|syncchat\.smshagor\.com\/uploads\/avatar\.jpg|\/assets\/icons\/user-avatar\.svg)(?:[?#].*)?$/i,
    target: '/assets/icons/user-avatar.svg',
  },
];

const getLegacyAvatarFallback = (value = '') => {
  const raw = String(value || '').trim();
  const match = LEGACY_AVATAR_FALLBACKS.find((item) => item.match.test(raw));
  return match?.target || '';
};

const getUploadOrigin = () => {
  const candidates = [config.socketUrl, config.apiBaseUrl, config.publicOrigin];

  for (const candidate of candidates) {
    try {
      const origin = new URL(candidate, window.location.origin).origin;
      if (origin) return origin;
    } catch (error0) {
      // Try the next configured URL.
    }
  }

  return window.location.origin;
};

const resolveUploadUrl = (url) => {
  if (!url) return url;

  const legacyFallback = getLegacyAvatarFallback(url);
  if (legacyFallback) return legacyFallback;

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (!parsed.pathname.startsWith('/uploads/')) return url;

      const hostname = window.location.hostname || 'localhost';

      if (config.isDev || isLocalHostname(hostname)) {
        return `${getUploadOrigin()}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch (error0) {
      return url;
    }

    return url;
  }

  if (!url.startsWith('/uploads/')) return url;

  return `${getUploadOrigin()}${url}`;
};

export default resolveUploadUrl;
