import config from '../config';

const isLocalHostname = (hostname = '') =>
  ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase());

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

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (!parsed.pathname.startsWith('/uploads/')) return url;

      const protocol = window.location.protocol || 'http:';
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

  if (config.isDev) {
    return `${getUploadOrigin()}${url}`;
  }

  return `${getUploadOrigin()}${url}`;
};

export default resolveUploadUrl;
