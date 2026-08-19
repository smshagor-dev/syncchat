const connectDb = require('./db/connect');
const {
  startScheduledMessageWorker,
} = require('./helpers/scheduledMessages');
const { configureSocketAdapter } = require('./helpers/socketAdapter');
const { getCallConfig } = require('./helpers/callConfig');
const ensureAvatarDefaults = require('./helpers/ensureAvatarDefaults');
const ensureChatIndexes = require('./helpers/chatIndexes');
const logger = require('./helpers/logger');

let bootstrapPromise = null;
let workerStarted = false;

const bootstrap = ({ startScheduledWorker = true } = {}) => {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await connectDb();
      await Promise.all([
        ensureChatIndexes(),
        ensureAvatarDefaults(),
        configureSocketAdapter(global.io),
        getCallConfig(),
      ]);

      logger.info('RUNTIME_READY', {
        vercel: process.env.VERCEL === '1',
        redis: Boolean(process.env.REDIS_URL),
        realtimeWarm: true,
      });

      return true;
    })().catch((error) => {
      bootstrapPromise = null;
      logger.error('RUNTIME_BOOTSTRAP_ERROR', {
        message: error.message,
        stack: error.stack,
      });
      throw error;
    });
  }

  if (startScheduledWorker && !workerStarted) {
    workerStarted = true;
    bootstrapPromise
      .then(() => {
        startScheduledMessageWorker();
      })
      .catch(() => {
        workerStarted = false;
      });
  }

  return bootstrapPromise;
};

module.exports = {
  bootstrap,
};
