import config from '../config';

const resolveUploadUrl = (url) => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (!url.startsWith('/uploads/')) return url;

  if (config.isDev) {
    const protocol = window.location.protocol || 'http:';
    const hostname = window.location.hostname || 'localhost';
    return `${protocol}//${hostname}:8080${url}`;
  }

  return url;
};

export default resolveUploadUrl;
