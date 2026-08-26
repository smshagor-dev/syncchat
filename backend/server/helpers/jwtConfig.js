const isProduction = process.env.NODE_ENV === 'production';

const configuredSecret = String(process.env.JWT_SECRET || '').trim();
const DEV_FALLBACK_SECRET = 'syncchat-development-only-secret-change-before-production';

if (isProduction && !configuredSecret) {
  throw new Error('JWT_SECRET is required in production');
}

if (isProduction && configuredSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

const JWT_SECRET = configuredSecret || DEV_FALLBACK_SECRET;
const USER_ACCESS_TOKEN_TTL = String(
  process.env.USER_ACCESS_TOKEN_TTL || '7d'
).trim();
const USER_REFRESH_TOKEN_TTL = String(
  process.env.USER_REFRESH_TOKEN_TTL || '365d'
).trim();
const ADMIN_ACCESS_TOKEN_TTL = String(
  process.env.ADMIN_ACCESS_TOKEN_TTL || '7d'
).trim();
const TWO_FACTOR_TOKEN_TTL = String(
  process.env.TWO_FACTOR_TOKEN_TTL || '10m'
).trim();

const JWT_ISSUER = 'syncchat';
const USER_AUDIENCE = 'syncchat-user';
const ADMIN_AUDIENCE = 'syncchat-admin';

module.exports = {
  ADMIN_ACCESS_TOKEN_TTL,
  ADMIN_AUDIENCE,
  JWT_ISSUER,
  JWT_SECRET,
  TWO_FACTOR_TOKEN_TTL,
  USER_ACCESS_TOKEN_TTL,
  USER_REFRESH_TOKEN_TTL,
  USER_AUDIENCE,
};
