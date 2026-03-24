const isDev = process.env.NODE_ENV === 'development';
const {
  getAdminOrigin,
  getClientOrigin,
  getServerOrigin,
  normalizeOrigin,
} = require('./helpers/origins');

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
    } else if (parsed.hostname.includes('.')) {
      variants.add(
        `${parsed.protocol}//www.${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`
      );
    }

    return Array.from(variants);
  } catch (error0) {
    return [trimmed];
  }
};

const configuredOrigins = [
  ...String(process.env.APP_ORIGIN || '')
    .split(','),
  getClientOrigin(),
  getAdminOrigin(),
  getServerOrigin(),
  normalizeOrigin(process.env.PUBLIC_ORIGIN || ''),
  normalizeOrigin(process.env.API_BASE_URL || ''),
  normalizeOrigin(process.env.SOCKET_URL || ''),
]
  .flatMap((origin) => withWwwVariants(origin))
  .filter(Boolean);

module.exports = {
  isDev,
  cors: {
    origin: Array.from(new Set(configuredOrigins)),
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'syncchat',
    user: process.env.DB_USER || 'root',
    pass: process.env.DB_PASSWORD || '',
    autoMigrate: process.env.DB_AUTO_MIGRATE !== 'false',
  },
};
