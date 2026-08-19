const crypto = require('crypto');
const AdminSecurityConfigModel = require('../db/models/adminSecurityConfig');
const { asArray } = require('../db/utils');
const { getClientIp, normalizeIp } = require('./clientIp');

let cachedConfig = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

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

  const defaultRateLimits = {
    enabled: true,
    windowSeconds: 60,
    maxRequests: 180,
  };

  const [row] = await AdminSecurityConfigModel.findOrCreate({
    where: {},
    defaults: {
      blockedIps: [],
      blockedFingerprints: [],
      rateLimits: defaultRateLimits,
    },
  });

  const plain = row?.get ? row.get({ plain: true }) : row;
  const rateLimits =
    plain?.rateLimits && typeof plain.rateLimits === 'object'
      ? plain.rateLimits
      : defaultRateLimits;

  cachedConfig = {
    blockedIps: asArray(plain?.blockedIps).filter(Boolean),
    blockedFingerprints: asArray(plain?.blockedFingerprints).filter(Boolean),
    rateLimits: {
      enabled:
        typeof rateLimits.enabled === 'boolean'
          ? rateLimits.enabled
          : defaultRateLimits.enabled,
      windowSeconds: Math.max(
        10,
        Math.min(3600, Number(rateLimits.windowSeconds) || defaultRateLimits.windowSeconds)
      ),
      maxRequests: Math.max(
        10,
        Math.min(5000, Number(rateLimits.maxRequests) || defaultRateLimits.maxRequests)
      ),
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
