const normalizeIp = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/^::ffff:/, '');
};

const shouldTrustForwardedHeaders = () =>
  process.env.VERCEL === '1' ||
  String(process.env.TRUST_PROXY || '').trim().toLowerCase() === 'true';

const getClientIp = (req) => {
  if (!req) return '';

  if (shouldTrustForwardedHeaders()) {
    const forwarded = String(
      req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || ''
    )
      .split(',')[0]
      .trim();
    if (forwarded) return normalizeIp(forwarded);
  }

  return normalizeIp(req.ip || req.socket?.remoteAddress || '');
};

module.exports = {
  getClientIp,
  normalizeIp,
  shouldTrustForwardedHeaders,
};
