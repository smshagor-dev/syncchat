require('dotenv').config({ path: './.env' });

const express = require('express');
const { Server: SocketServer } = require('socket.io');
const http = require('http');
const path = require('path');
const cors = require('cors');
const routes = require('./routes');
const config = require('./config');
const { uploadRootDir } = require('./helpers/storage');
const logger = require('./helpers/logger');

const app = express();
const server = http.createServer(app);

// middleware
app.use(cors(config.cors));
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

if (!config.isDev) {
  app.use(express.static('client/public'));
  const client = path.join(__dirname, '..', 'client', 'public', 'index.html');

  app.get('*', (req, res) => res.sendFile(client));
}

// store socket on global object
global.io = new SocketServer(server, {
  cors: config.cors,
  maxHttpBufferSize: Number(process.env.SOCKET_MAX_HTTP_BUFFER_SIZE || 25e6),
});
require('./socket');

module.exports = server;
