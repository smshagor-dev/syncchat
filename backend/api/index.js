const server = require('../server/server');
const { bootstrap } = require('../server/bootstrap');
const logger = require('../server/helpers/logger');

const runtimeReady = bootstrap({ startScheduledWorker: false });

global.syncchatRuntimeReady = runtimeReady;

if (global.io && !global.__syncchatVercelSocketBootstrapInstalled) {
  global.__syncchatVercelSocketBootstrapInstalled = true;
  global.io.use(async (socket, next) => {
    try {
      await runtimeReady;
      next();
    } catch (error) {
      logger.error('SOCKET_BOOTSTRAP_BLOCKED', {
        socketId: socket.id,
        message: error.message,
      });
      next(new Error('Realtime service is temporarily unavailable'));
    }
  });
}

module.exports = server;
