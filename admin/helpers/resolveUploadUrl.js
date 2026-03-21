import config from '../config';

const isLocalHostname = (hostname = '') =>
  ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase());

const resolveUploadUrl = (url) => {
  if (!url) return url;

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (!parsed.pathname.startsWith('/uploads/')) return url;

      const protocol = window.location.protocol || 'http:';
      const hostname = window.location.hostname || 'localhost';

      if (config.isDev || isLocalHostname(hostname)) {
        return `${protocol}//${hostname}:8080${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch (error0) {
      return url;
    }

    return url;
  }

  if (!url.startsWith('/uploads/')) return url;

  if (config.isDev || isLocalHostname(window.location.hostname || '')) {
    const protocol = window.location.protocol || 'http:';
    const hostname = window.location.hostname || 'localhost';
    return `${protocol}//${hostname}:8080${url}`;
  }

  return url;
};

export default resolveUploadUrl;
