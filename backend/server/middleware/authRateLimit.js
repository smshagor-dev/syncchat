const crypto = require('crypto');
const { getClientIp } = require('../helpers/clientIp');
const { getSocketRedisCommandClient } = require('../helpers/socketAdapter');
const logger = require('../helpers/logger');

const RULES = new Map([
  ['POST /api/users/register', { name: 'register', max: 5, windowSec: 3600 }],
  ['POST /api/users/login', { name: 'login', max: 12, windowSec: 900, identifier: true }],
  ['POST /api/users/login/2fa-verify', { name: '2fa', max: 10, windowSec: 600 }],
  ['POST /api/users/forgot-pass/request', { name: 'forgot-request', max: 5, windowSec: 900, identifier: true }],
  ['POST /api/users/forgot-pass/verify', { name: 'forgot-verify', max: 8, windowSec: 600, identifier: true }],
  ['POST /api/users/forgot-pass/reset', { name: 'forgot-reset', max: 5, windowSec: 900, identifier: true }],
  ['POST /api/users/verify', { name: 'verify-account', max: 10, windowSec: 600 }],
  ['POST /api/users/verify/resend', { name: 'verify-resend', max: 4, windowSec: 600 }],
  ['POST /api/users/social-auth', { name: 'social-login', max: 30, windowSec: 900 }],
  ['POST /api/users/device-link/complete', { name: 'device-link', max: 10, windowSec: 600 }],
  ['POST /api/admin/login', { name: 'admin-login', max: 10, windowSec: 900, identifier: true }],
  ['POST /api/admin/register', { name: 'admin-register', max: 5, windowSec: 3600 }],
]);

const memory = new Map();
let cleanupCounter = 0;

const digest = (value) =>
  crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 32);

const normalizedIdentifier = (req) =>
  String(req.body?.email || req.body?.username || '')
    .trim()
    .toLowerCase();

const consumeMemory = (key, windowSec) => {
  const now = Date.now();
  let bucket = memory.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowSec * 1000 };
  }
  bucket.count += 1;
  memory.set(key, bucket);

  cleanupCounter += 1;
  if (cleanupCounter % 250 === 0) {
    for (const [candidate, value] of memory.entries()) {
      if (value.resetAt <= now) memory.delete(candidate);
    }
  }

  return {
    count: bucket.count,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
};

const consumeRedis = async (client, key, windowSec) => {
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, windowSec);
  const ttl = await client.ttl(key);
  return { count, retryAfter: Math.max(1, Number(ttl) || windowSec) };
};

const consume = async (key, windowSec) => {
  try {
    const client = await getSocketRedisCommandClient();
    if (client?.isReady) return await consumeRedis(client, key, windowSec);
  } catch (error0) {
    logger.warn('AUTH_RATE_LIMIT_REDIS_FALLBACK', { message: error0.message });
  }
  return consumeMemory(key, windowSec);
};

module.exports = async (req, res, next) => {
  const rule = RULES.get(`${String(req.method || '').toUpperCase()} ${req.path}`);
  if (!rule) return next();

  try {
    const ipHash = digest(getClientIp(req) || 'unknown');
    const keys = [`syncchat:ratelimit:${rule.name}:ip:${ipHash}`];
    if (rule.identifier) {
      const identifier = normalizedIdentifier(req);
      if (identifier) {
        keys.push(`syncchat:ratelimit:${rule.name}:id:${digest(identifier)}`);
      }
    }

    let retryAfter = rule.windowSec;
    for (const key of keys) {
      // eslint-disable-next-line no-await-in-loop
      const state = await consume(key, rule.windowSec);
      retryAfter = Math.max(retryAfter, state.retryAfter);
      if (state.count > rule.max) {
        res.setHeader('Retry-After', String(state.retryAfter));
        res.status(429).json({
          success: false,
          message: 'Too many attempts. Please try again later.',
        });
        return;
      }
    }
    next();
  } catch (error0) {
    logger.error('AUTH_RATE_LIMIT_ERROR', { message: error0.message });
    // Availability wins if the limiter itself fails. Authentication and OTP
    // attempt counters still provide a second layer of protection.
    next();
  }
};
