const isDev = process.env.NODE_ENV === 'development';
const {
  getAdminOrigin,
  getClientOrigin,
  getServerOrigin,
  normalizeOrigin,
} = require('./helpers/origins');

const firstPartyProductionOrigins = [
  'https://syncchat.live',
  'https://admin.syncchat.live',
  'https://api.syncchat.live',
];

const splitOrigins = (...values) =>
  values
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);

const withWwwVariants = (origin) => {
  const trimmed = String(origin || '').trim().replace(/\/$/, '');
  if (!trimmed) return [];

  try {
    const parsed = new URL(trimmed);
    const variants = new Set([parsed.origin]);

    if (parsed.hostname.startsWith('www.')) {
      variants.add(
        `${parsed.protocol}//${parsed.hostname.replace(/^www\./, '')}${parsed.port ? `:${parsed.port}` : ''}`
      );
    } else if (parsed.hostname === 'syncchat.live') {
      variants.add(
        `${parsed.protocol}//www.${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`
      );
    }

    return Array.from(variants);
  } catch (error0) {
    return [trimmed];
  }
};

const configuredOrigins = splitOrigins(
  process.env.CORS_ORIGINS,
  process.env.APP_ORIGIN,
  process.env.CLIENT_ORIGIN,
  process.env.ADMIN_ORIGIN,
  process.env.ADMIN_PUBLIC_ORIGIN,
  process.env.PUBLIC_ORIGIN,
  process.env.SERVER_ORIGIN,
  process.env.API_ORIGIN,
  process.env.API_BASE_URL,
  process.env.SOCKET_URL,
  getClientOrigin(),
  getAdminOrigin(),
  getServerOrigin(),
  ...(!isDev ? firstPartyProductionOrigins : [])
)
  .flatMap((origin) => withWwwVariants(origin))
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

module.exports = {
  isDev,
  serveFrontend: process.env.SERVE_FRONTEND === 'true',
  cors: {
    origin: Array.from(new Set(configuredOrigins)),
  },
  db: {
    uri:
      process.env.MONGODB_URI ||
      process.env.MONGO_URI ||
      'mongodb://127.0.0.1:27017/syncchat',
    name: process.env.MONGODB_DB_NAME || process.env.DB_NAME || 'syncchat',
    autoIndex: process.env.MONGODB_AUTO_INDEX !== 'false',
    serverSelectionTimeoutMs: Number(
      process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000
    ),
  },
};
