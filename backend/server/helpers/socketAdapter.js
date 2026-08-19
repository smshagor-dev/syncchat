const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const logger = require('./logger');

let adapterPromise = null;
let redisClients = null;

const isRedisConfigured = () => Boolean(String(process.env.REDIS_URL || '').trim());

const configureSocketAdapter = async (io = global.io) => {
  if (!io || !isRedisConfigured()) return null;
  if (adapterPromise) return adapterPromise;

  adapterPromise = (async () => {
    const redisUrl = String(process.env.REDIS_URL || '').trim();
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (error) => {
      logger.error('REDIS_PUB_ERROR', { message: error.message });
    });
    subClient.on('error', (error) => {
      logger.error('REDIS_SUB_ERROR', { message: error.message });
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    redisClients = { pubClient, subClient };

    logger.info('SOCKET_REDIS_ADAPTER_READY', {
      provider: 'redis',
    });

    return redisClients;
  })().catch((error) => {
    adapterPromise = null;
    logger.error('SOCKET_REDIS_ADAPTER_ERROR', {
      message: error.message,
      stack: error.stack,
    });
    throw error;
  });

  return adapterPromise;
};

const getSocketRedisCommandClient = async () => {
  if (!isRedisConfigured()) return null;
  if (redisClients?.pubClient?.isReady) return redisClients.pubClient;
  if (!adapterPromise) return null;

  const clients = await adapterPromise;
  return clients?.pubClient?.isReady ? clients.pubClient : null;
};

const closeSocketAdapter = async () => {
  const clients = redisClients;
  redisClients = null;
  adapterPromise = null;
  if (!clients) return;

  await Promise.allSettled([
    clients.pubClient?.quit?.(),
    clients.subClient?.quit?.(),
  ]);
};

module.exports = {
  configureSocketAdapter,
  getSocketRedisCommandClient,
  closeSocketAdapter,
  isRedisConfigured,
};
