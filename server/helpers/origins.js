const normalizeOrigin = (value = '') => String(value || '').trim().replace(/\/$/, '');

const getClientOrigin = () =>
  normalizeOrigin(
    process.env.CLIENT_ORIGIN || process.env.PUBLIC_ORIGIN || process.env.APP_ORIGIN
  );

const getAdminOrigin = () =>
  normalizeOrigin(
    process.env.ADMIN_ORIGIN || process.env.ADMIN_PUBLIC_ORIGIN || process.env.APP_ORIGIN
  );

const getServerOrigin = () =>
  normalizeOrigin(
    process.env.SERVER_ORIGIN
      || process.env.API_ORIGIN
      || process.env.SOCKET_URL
      || process.env.API_BASE_URL
      || process.env.APP_ORIGIN
  );

const getClientOriginFromRequest = (req) =>
  normalizeOrigin(req?.get?.('origin')) || getClientOrigin();

const getHostnameFromOrigin = (origin = '') => {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch (error0) {
    return '';
  }
};

module.exports = {
  getAdminOrigin,
  getClientOrigin,
  getClientOriginFromRequest,
  getHostnameFromOrigin,
  getServerOrigin,
  normalizeOrigin,
};
