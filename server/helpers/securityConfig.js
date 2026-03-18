const crypto = require('crypto');
const AdminSecurityConfigModel = require('../db/models/adminSecurityConfig');
const { asArray } = require('../db/utils');

let cachedConfig = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

const normalizeIp = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/^::ffff:/, '');
};

const getClientIp = (req) => {
  const forwarded = String(
    req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || ''
  )
    .split(',')[0]
    .trim();
  return normalizeIp(forwarded || req.ip || req.socket?.remoteAddress || '');
};

const buildFingerprint = ({ userAgent = '', acceptLanguage = '' }) =>
  crypto
    .createHash('sha256')
    .update(`${String(userAgent)}::${String(acceptLanguage)}`)
    .digest('hex');

const getRequestFingerprint = (req) =>
  buildFingerprint({
    userAgent: String(req.headers['user-agent'] || ''),
    acceptLanguage: String(req.headers['accept-language'] || ''),
  });

const loadSecurityConfig = async () => {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL_MS) return cachedConfig;

  const [row] = await AdminSecurityConfigModel.findOrCreate({
    where: {},
    defaults: {
      blockedIps: [],
      blockedFingerprints: [],
      rateLimits: {
        enabled: false,
        windowSeconds: 60,
        maxRequests: 120,
      },
    },
  });

  const plain = row?.get ? row.get({ plain: true }) : row;
  const rateLimits = plain?.rateLimits && typeof plain.rateLimits === 'object'
    ? plain.rateLimits
    : { enabled: false, windowSeconds: 60, maxRequests: 120 };

  cachedConfig = {
    blockedIps: asArray(plain?.blockedIps).filter(Boolean),
    blockedFingerprints: asArray(plain?.blockedFingerprints).filter(Boolean),
    rateLimits: {
      enabled: rateLimits.enabled === true,
      windowSeconds: Math.max(10, Math.min(3600, Number(rateLimits.windowSeconds) || 60)),
      maxRequests: Math.max(10, Math.min(5000, Number(rateLimits.maxRequests) || 120)),
    },
  };
  cachedAt = now;
  return cachedConfig;
};

module.exports = {
  loadSecurityConfig,
  getClientIp,
  getRequestFingerprint,
  normalizeIp,
};
