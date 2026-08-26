require('dotenv').config({ path: './.env' });

const crypto = require('crypto');
const express = require('express');
const { Server: SocketServer } = require('socket.io');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const routes = require('./routes');
const config = require('./config');
const logger = require('./helpers/logger');
const {
  loadSecurityConfig,
  getClientIp,
  getRequestFingerprint,
} = require('./helpers/securityConfig');
const { loadAppConfig } = require('./helpers/appConfig');
const { getAdminOrigin, getHostnameFromOrigin } = require('./helpers/origins');
const { installSocketAuthentication } = require('./socket/auth');
const { getSocketRedisCommandClient } = require('./helpers/socketAdapter');
const authRateLimit = require('./middleware/authRateLimit');

const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');
if (
  process.env.VERCEL === '1' ||
  String(process.env.TRUST_PROXY || '').trim().toLowerCase() === 'true'
) {
  app.set('trust proxy', 1);
}

const allowedOrigins = config.cors.origin;
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
};

app.use((req, res, next) => {
  const requestId =
    String(req.headers['x-request-id'] || '').trim().slice(0, 128) ||
    crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()'
  );
  res.setHeader(
    'Content-Security-Policy',
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  );
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }
  next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(
  express.urlencoded({ limit: '10mb', parameterLimit: 10000, extended: false })
);

// Vercel starts database/runtime bootstrap next to the exported Express app.
// Await that shared promise before an HTTP request reaches DB-backed middleware.
app.use(async (req, res, next) => {
  try {
    if (global.syncchatRuntimeReady) await global.syncchatRuntimeReady;
    next();
  } catch (error0) {
    logger.error('HTTP_RUNTIME_NOT_READY', {
      requestId: req.requestId,
      path: req.path,
      message: error0.message,
    });
    res.status(503).json({
      success: false,
      message: 'Service is temporarily unavailable',
      requestId: req.requestId,
    });
  }
});

// Never let the admin UI's masked password placeholder overwrite the real SMTP
// secret. An empty string intentionally clears the password; "******" does not.
app.use((req, res, next) => {
  if (
    req.method === 'PATCH' &&
    req.path === '/api/admin/app-config' &&
    req.body?.smtp?.pass === '******'
  ) {
    req.body.smtp = { ...req.body.smtp };
    delete req.body.smtp.pass;
  }
  next();
});

app.use(authRateLimit);

app.use((req, res, next) => {
  const start = Date.now();
  logger.info('HTTP_IN', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: getClientIp(req),
  });
  res.on('finish', () => {
    logger.info('HTTP_OUT', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      tookMs: Date.now() - start,
    });
  });
  next();
});

const rateBuckets = new Map();
let globalRateRequests = 0;
const getRateKey = (req) => `${getClientIp(req)}::${req.method}::${req.path}`;
const hashRateKey = (key) =>
  crypto.createHash('sha256').update(key).digest('hex');

const consumeGlobalRateLimit = async ({ key, windowSeconds }) => {
  try {
    const redis = await getSocketRedisCommandClient();
    if (redis?.isReady) {
      const redisKey = `syncchat:ratelimit:global:${hashRateKey(key)}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.expire(redisKey, windowSeconds);
      const ttl = await redis.ttl(redisKey);
      return {
        count,
        retryAfter: Math.max(1, Number(ttl) || windowSeconds),
      };
    }
  } catch (error0) {
    logger.warn('GLOBAL_RATE_LIMIT_REDIS_FALLBACK', {
      message: error0.message,
    });
  }

  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);

  globalRateRequests += 1;
  if (globalRateRequests % 500 === 0) {
    for (const [candidate, value] of rateBuckets.entries()) {
      if (value.resetAt <= now) rateBuckets.delete(candidate);
    }
  }

  return {
    count: bucket.count,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
};

app.use(async (req, res, next) => {
  try {
    const securityConfig = await loadSecurityConfig();
    const ip = getClientIp(req);
    const fingerprint = getRequestFingerprint(req);
    if (
      securityConfig.blockedIps.includes(ip) ||
      securityConfig.blockedFingerprints.includes(fingerprint)
    ) {
      res.status(403).json({ success: false, message: 'Request blocked' });
      return;
    }
    if (securityConfig.rateLimits.enabled) {
      const state = await consumeGlobalRateLimit({
        key: getRateKey(req),
        windowSeconds: securityConfig.rateLimits.windowSeconds,
      });
      if (state.count > securityConfig.rateLimits.maxRequests) {
        res.setHeader('Retry-After', String(state.retryAfter));
        res.status(429).json({
          success: false,
          message: 'Rate limit exceeded',
        });
        return;
      }
    }
    next();
  } catch (error0) {
    logger.warn('SECURITY_CONFIG_CHECK_FAILED', {
      requestId: req.requestId,
      message: error0.message,
    });
    next();
  }
});

app.use(async (req, res, next) => {
  try {
    const pathName = String(req.path || '');
    if (!pathName.startsWith('/api')) return next();
    const trimmed = pathName.replace(/^\/api\/?/, '');
    if (trimmed.startsWith('admin') || trimmed.startsWith('app-config')) {
      return next();
    }
    const appConfig = await loadAppConfig();
    if (appConfig?.maintenance?.enabled) {
      res.status(503).json({
        success: false,
        message:
          appConfig.maintenance.message || 'Maintenance in progress',
      });
      return;
    }
    next();
  } catch (error0) {
    next(error0);
  }
});

// Persistent upload files are served by the configured FTP/FTPS public origin.
// The backend intentionally does not expose or maintain a local /uploads directory.
app.use('/api', routes);
app.use((error, req, res, next) => {
  if (!(error instanceof multer.MulterError)) return next(error);
  if (error.code === 'LIMIT_FILE_SIZE') {
    const limitMb = Number(
      process.env.CHAT_UPLOAD_HARD_LIMIT_MB ||
        process.env.CHAT_UPLOAD_LIMIT_MB ||
        250
    );
    res.status(413).json({
      success: false,
      message: `File too large. Max ${limitMb} MB allowed.`,
    });
    return;
  }
  res.status(400).json({
    success: false,
    message: error.message || 'Upload failed',
  });
});

const normalizeRoutePath = (value = '') =>
  String(value || '').replace(/^\/+|\/+$/g, '');
const matchesPath = (pathname = '', target = '') => {
  if (!target) return false;
  if (pathname === target) return true;
  return pathname.startsWith(`${target}/`);
};
const configuredAdminHostname = getHostnameFromOrigin(getAdminOrigin());
const getRequestHostname = (req) =>
  String(req.hostname || req.headers.host || '')
    .split(':')[0]
    .toLowerCase();

const adminStandalonePages = new Map([
  ['admin/storage', 'storage.html'],
  ['admin/calling', 'calling.html'],
  ['admin/calling-push', 'calling-push.html'],
  ['admin/social-auth', 'social-auth.html'],
  ['admin/mail', 'mail.html'],
]);

if (!config.isDev && config.serveFrontend) {
  const publicRoot = path.resolve(
    __dirname,
    '..',
    '..',
    'frontend',
    'client',
    'public'
  );
  const clientIndex = path.join(publicRoot, 'index.html');
  const adminRoot = path.join(publicRoot, 'admin');
  const adminIndex = path.join(adminRoot, 'index.html');
  const hasFrontendBuild =
    fs.existsSync(clientIndex) && fs.existsSync(adminIndex);
  if (!hasFrontendBuild) {
    console.warn(
      '[startup] Frontend build files were not found. Client/admin routes will not be available.'
    );
  } else {
    app.use(express.static(publicRoot));
    app.get('/{*splat}', async (req, res) => {
      const pathname = normalizeRoutePath(req.path);
      const requestHostname = getRequestHostname(req);
      const isAdminHost =
        !!configuredAdminHostname &&
        requestHostname === configuredAdminHostname;
      if (matchesPath(pathname, 'api') || matchesPath(pathname, 'socket.io')) {
        res.status(404).send('Not found');
        return;
      }

      const standaloneAdminFile = adminStandalonePages.get(pathname);
      if (standaloneAdminFile) {
        const standalonePath = path.join(adminRoot, standaloneAdminFile);
        if (fs.existsSync(standalonePath)) {
          res.sendFile(standalonePath);
          return;
        }
      }

      if (isAdminHost || matchesPath(pathname, 'admin')) {
        res.sendFile(adminIndex);
        return;
      }
      res.sendFile(clientIndex);
    });
  }
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  logger.error('HTTP_UNHANDLED_ERROR', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    message: error?.message || 'Unknown error',
    ...(process.env.NODE_ENV !== 'production'
      ? { stack: error?.stack }
      : {}),
  });
  res.status(error?.statusCode || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production' && !error?.statusCode
        ? 'Internal server error'
        : error?.message || 'Internal server error',
    requestId: req.requestId,
  });
});

global.io = new SocketServer(server, {
  cors: corsOptions,
  transports: ['websocket'],
  maxHttpBufferSize: Number(process.env.SOCKET_MAX_HTTP_BUFFER_SIZE || 25e6),
});
installSocketAuthentication(global.io);
require('./socket');

module.exports = server;
