require('dotenv').config({ path: './.env' });

const express = require('express');
const { Server: SocketServer } = require('socket.io');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const routes = require('./routes');
const config = require('./config');
const { uploadRootDir } = require('./helpers/storage');
const logger = require('./helpers/logger');
const { loadSecurityConfig, getClientIp, getRequestFingerprint } = require('./helpers/securityConfig');
const { loadAppConfig } = require('./helpers/appConfig');
const { getAdminOrigin, getHostnameFromOrigin } = require('./helpers/origins');

const app = express();
const server = http.createServer(app);

// middleware
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

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(
  express.urlencoded({
    limit: '10mb',
    parameterLimit: 100000,
    extended: false,
  })
);

app.use((req, res, next) => {
  const start = Date.now();
  logger.info('HTTP_IN', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user?._id || null,
  });

  res.on('finish', () => {
    logger.info('HTTP_OUT', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      tookMs: Date.now() - start,
    });
  });

  next();
});

const rateBuckets = new Map();
const getRateKey = (req) => `${getClientIp(req)}::${req.method}::${req.path}`;

app.use(async (req, res, next) => {
  try {
    const config = await loadSecurityConfig();
    const ip = getClientIp(req);
    const fingerprint = getRequestFingerprint(req);

    if (config.blockedIps.includes(ip)) {
      res.status(403).json({
        success: false,
        message: 'Request blocked',
      });
      return;
    }

    if (config.blockedFingerprints.includes(fingerprint)) {
      res.status(403).json({
        success: false,
        message: 'Request blocked',
      });
      return;
    }

    if (config.rateLimits.enabled) {
      const windowMs = config.rateLimits.windowSeconds * 1000;
      const key = getRateKey(req);
      const now = Date.now();
      const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
      if (now > bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = now + windowMs;
      }
      bucket.count += 1;
      rateBuckets.set(key, bucket);
      if (bucket.count > config.rateLimits.maxRequests) {
        res.status(429).json({
          success: false,
          message: 'Rate limit exceeded',
        });
        return;
      }
    }

    next();
  } catch (error0) {
    next();
  }
});

app.use(async (req, res, next) => {
  try {
    const pathName = String(req.path || '');
    if (!pathName.startsWith('/api')) {
      next();
      return;
    }
    const trimmed = pathName.replace(/^\/api\/?/, '');
    if (trimmed.startsWith('admin') || trimmed.startsWith('app-config')) {
      next();
      return;
    }

    const appConfig = await loadAppConfig();
    if (appConfig?.maintenance?.enabled) {
      res.status(503).json({
        success: false,
        message: appConfig.maintenance.message || 'Maintenance in progress',
      });
      return;
    }

    next();
  } catch (error0) {
    next();
  }
});

app.use(
  '/uploads',
  express.static(uploadRootDir, {
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  })
);
app.use('/api', routes);
app.use((error, req, res, next) => {
  if (!(error instanceof multer.MulterError)) {
    next(error);
    return;
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    const limitMb = Number(process.env.CHAT_UPLOAD_LIMIT_MB || 100);
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

if (!config.isDev && config.serveFrontend) {
  const publicRoot = path.resolve(__dirname, '..', '..', 'frontend', 'client', 'public');
  const clientIndex = path.join(publicRoot, 'index.html');
  const adminIndex = path.join(publicRoot, 'admin', 'index.html');
  const hasFrontendBuild = fs.existsSync(clientIndex) && fs.existsSync(adminIndex);

  if (!hasFrontendBuild) {
    console.warn('[startup] Frontend build files were not found. Client/admin routes will not be available.');
  } else {
    app.use(express.static(publicRoot));

    app.get('*', async (req, res) => {
      const pathname = normalizeRoutePath(req.path);
      const requestHostname = getRequestHostname(req);
      const isAdminHost =
        !!configuredAdminHostname && requestHostname === configuredAdminHostname;

      if (
        matchesPath(pathname, 'api')
        || matchesPath(pathname, 'uploads')
        || matchesPath(pathname, 'socket.io')
      ) {
        res.status(404).send('Not found');
        return;
      }

      if (isAdminHost || matchesPath(pathname, 'admin')) {
        res.sendFile(adminIndex);
        return;
      }

      res.sendFile(clientIndex);
    });
  }
}

// store socket on global object
global.io = new SocketServer(server, {
  cors: corsOptions,
  maxHttpBufferSize: Number(process.env.SOCKET_MAX_HTTP_BUFFER_SIZE || 25e6),
});
require('./socket');

module.exports = server;
