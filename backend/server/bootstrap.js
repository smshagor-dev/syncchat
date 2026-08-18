const connectDb = require('./db/connect');
const {
  startScheduledMessageWorker,
} = require('./helpers/scheduledMessages');
const { configureSocketAdapter } = require('./helpers/socketAdapter');
const logger = require('./helpers/logger');

let bootstrapPromise = null;
let workerStarted = false;

const bootstrap = ({ startScheduledWorker = true } = {}) => {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await connectDb();
      await configureSocketAdapter(global.io);

      logger.info('RUNTIME_READY', {
        vercel: process.env.VERCEL === '1',
        redis: Boolean(process.env.REDIS_URL),
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
