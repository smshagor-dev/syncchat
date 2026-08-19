const crypto = require('crypto');
const { createClient } = require('redis');
const logger = require('./logger');

const localWindows = new Map();
let redisPromise = null;

const MAX_MESSAGES = Math.max(5, Number(process.env.CHAT_RATE_LIMIT_MESSAGES || 30));
const WINDOW_SECONDS = Math.max(5, Number(process.env.CHAT_RATE_LIMIT_WINDOW_SEC || 10));
const MAX_DUPLICATES = Math.max(2, Number(process.env.CHAT_DUPLICATE_LIMIT || 6));
const DUPLICATE_WINDOW_SECONDS = Math.max(10, Number(process.env.CHAT_DUPLICATE_WINDOW_SEC || 30));

const getRedis = async () => {
  const url = String(process.env.REDIS_URL || '').trim();
  if (!url) return null;
  if (!redisPromise) {
    redisPromise = (async () => {
      const client = createClient({ url });
      client.on('error', (error) => {
        logger.warn('CHAT_ABUSE_REDIS_ERROR', { message: error.message });
      });
      await client.connect();
      return client;
    })().catch((error) => {
      redisPromise = null;
      logger.warn('CHAT_ABUSE_REDIS_CONNECT_FAILED', { message: error.message });
      return null;
    });
  }
  return redisPromise;
};

const createRateError = (message, code) => {
  const error = new Error(message);
  error.statusCode = 429;
  error.code = code;
  return error;
};

const normalizeBody = (text = '') => String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
const bodyHash = (text) => crypto.createHash('sha256').update(normalizeBody(text)).digest('hex').slice(0, 24);

const assertLocal = ({ userId, text }) => {
  const now = Date.now();
  const key = String(userId);
  const state = localWindows.get(key) || { messages: [], duplicates: new Map() };
  state.messages = state.messages.filter((at) => now - at < WINDOW_SECONDS * 1000);
  if (state.messages.length >= MAX_MESSAGES) {
    throw createRateError('You are sending messages too quickly. Please wait a moment.', 'CHAT_RATE_LIMIT');
  }
  state.messages.push(now);

  const normalized = normalizeBody(text);
  if (normalized.length >= 4) {
    const hash = bodyHash(normalized);
    const previous = (state.duplicates.get(hash) || []).filter(
      (at) => now - at < DUPLICATE_WINDOW_SECONDS * 1000
    );
    if (previous.length >= MAX_DUPLICATES) {
      throw createRateError('Repeated message flood detected.', 'CHAT_DUPLICATE_FLOOD');
    }
    previous.push(now);
    state.duplicates.set(hash, previous);
  }

  localWindows.set(key, state);
};

const assertRedis = async ({ redis, userId, text }) => {
  const base = `syncchat:chat:rate:${userId}`;
  const count = await redis.incr(base);
  if (count === 1) await redis.expire(base, WINDOW_SECONDS);
  if (count > MAX_MESSAGES) {
    throw createRateError('You are sending messages too quickly. Please wait a moment.', 'CHAT_RATE_LIMIT');
  }

  const normalized = normalizeBody(text);
  if (normalized.length >= 4) {
    const dupKey = `syncchat:chat:dup:${userId}:${bodyHash(normalized)}`;
    const duplicateCount = await redis.incr(dupKey);
    if (duplicateCount === 1) await redis.expire(dupKey, DUPLICATE_WINDOW_SECONDS);
    if (duplicateCount > MAX_DUPLICATES) {
      throw createRateError('Repeated message flood detected.', 'CHAT_DUPLICATE_FLOOD');
    }
  }
};

const assertChatSendAllowed = async ({ userId, text = '' }) => {
  if (!userId) throw createRateError('Authenticated user is required.', 'CHAT_AUTH_REQUIRED');

  const urls = String(text || '').match(/https?:\/\/\S+/gi) || [];
  if (urls.length > 12) {
    throw createRateError('Too many links in one message.', 'CHAT_LINK_FLOOD');
  }

  const mentions = String(text || '').match(/@[a-z0-9_]{2,32}/gi) || [];
  if (mentions.length > 50) {
    throw createRateError('Too many mentions in one message.', 'CHAT_MENTION_FLOOD');
  }

  const redis = await getRedis();
  if (redis) {
    await assertRedis({ redis, userId, text });
    return;
  }
  assertLocal({ userId, text });
};

module.exports = {
  assertChatSendAllowed,
};
