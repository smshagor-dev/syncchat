const { createClient } = require('redis');
const logger = require('./logger');

const DEFAULT_TTL_SEC = 24 * 60 * 60;
const MIN_TTL_SEC = 5 * 60;
const MAX_TTL_SEC = 7 * 24 * 60 * 60;

const clampTtl = (value) => {
  const parsed = Number(value || DEFAULT_TTL_SEC);
  if (!Number.isFinite(parsed)) return DEFAULT_TTL_SEC;
  return Math.min(MAX_TTL_SEC, Math.max(MIN_TTL_SEC, Math.floor(parsed)));
};

const stateTtlSec = clampTtl(process.env.CALL_STATE_TTL_SEC);
const redisUrl = String(process.env.REDIS_URL || '').trim();
const production = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

let redisPromise = null;
let warnedFallback = false;
const memory = new Map();

const callKey = (callId) => `syncchat:call:active:${callId}`;
const roomKey = (roomId) => `syncchat:call:room:${roomId}`;
const userKey = (userId) => `syncchat:call:user:${userId}`;

const unique = (values) => [
  ...new Set((Array.isArray(values) ? values : []).filter(Boolean)),
];

const getStateBusyUserIds = (state = {}) => {
  const rejected = new Set(unique(state.rejectedUserIds));
  const source = unique([
    ...(Array.isArray(state.busyUserIds) ? state.busyUserIds : []),
    state.initiatorId,
    ...(Array.isArray(state.recipientsId) ? state.recipientsId : []),
    ...(Array.isArray(state.joinedUserIds) ? state.joinedUserIds : []),
  ]);
  return source.filter((userId) => !rejected.has(userId));
};

const memorySet = (key, value, ttlSec = stateTtlSec) => {
  memory.set(key, {
    value,
    expiresAt: Date.now() + clampTtl(ttlSec) * 1000,
  });
};

const memoryGet = (key) => {
  const item = memory.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return item.value;
};

const memoryDelete = (key) => {
  memory.delete(key);
};

const getRedis = async () => {
  if (!redisUrl) {
    if (production) {
      const error = new Error(
        'REDIS_URL is required for durable production call state'
      );
      error.code = 'CALL_STATE_REDIS_REQUIRED';
      throw error;
    }
    if (!warnedFallback) {
      warnedFallback = true;
      logger.warn('CALL_STATE_MEMORY_FALLBACK', {
        message: 'REDIS_URL is not configured; using development-only memory call state',
      });
    }
    return null;
  }

  if (redisPromise) return redisPromise;

  redisPromise = (async () => {
    const client = createClient({ url: redisUrl });
    client.on('error', (error) => {
      logger.error('CALL_STATE_REDIS_ERROR', { message: error.message });
    });
    await client.connect();
    logger.info('CALL_STATE_REDIS_READY', {
      ttlSec: stateTtlSec,
    });
    return client;
  })().catch((error) => {
    redisPromise = null;
    throw error;
  });

  return redisPromise;
};

const encodeState = (state, ttlSec = stateTtlSec) => ({
  ...state,
  updatedAt: Date.now(),
  expiresAt: Date.now() + clampTtl(ttlSec) * 1000,
});

const getCallStateById = async (callId) => {
  if (!callId) return null;
  const client = await getRedis();
  const raw = client
    ? await client.get(callKey(callId))
    : memoryGet(callKey(callId));
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error) {
    logger.error('CALL_STATE_PARSE_ERROR', {
      callId,
      message: error.message,
    });
    return null;
  }
};

const getActiveCallByRoom = async (roomId) => {
  if (!roomId) return null;
  const client = await getRedis();
  const callId = client
    ? await client.get(roomKey(roomId))
    : memoryGet(roomKey(roomId));
  if (!callId) return null;

  const state = await getCallStateById(callId);
  if (!state) {
    if (client) await client.del(roomKey(roomId));
    else memoryDelete(roomKey(roomId));
    return null;
  }
  return state;
};

const getBusyCallId = async (userId) => {
  if (!userId) return null;
  const client = await getRedis();
  const callId = client
    ? await client.get(userKey(userId))
    : memoryGet(userKey(userId));
  if (!callId) return null;

  const state = await getCallStateById(callId);
  if (!state) {
    if (client) await client.del(userKey(userId));
    else memoryDelete(userKey(userId));
    return null;
  }
  return callId;
};

const saveActiveCall = async (state, ttlSec = stateTtlSec) => {
  if (!state?.callId || !state?.roomId) {
    throw new Error('callId and roomId are required to persist active call state');
  }

  const ttl = clampTtl(ttlSec);
  const next = encodeState(state, ttl);
  const busyUserIds = getStateBusyUserIds(next);
  next.busyUserIds = busyUserIds;

  const client = await getRedis();
  if (!client) {
    memorySet(callKey(next.callId), next, ttl);
    memorySet(roomKey(next.roomId), next.callId, ttl);
    busyUserIds.forEach((userId) => memorySet(userKey(userId), next.callId, ttl));
    return next;
  }

  const multi = client.multi();
  multi.set(callKey(next.callId), JSON.stringify(next), { EX: ttl });
  multi.set(roomKey(next.roomId), next.callId, { EX: ttl });
  busyUserIds.forEach((userId) => {
    multi.set(userKey(userId), next.callId, { EX: ttl });
  });
  await multi.exec();
  return next;
};

const releaseMappedKey = async (client, key, callId) => {
  if (!client) {
    if (memoryGet(key) === callId) memoryDelete(key);
    return;
  }
  const current = await client.get(key);
  if (current === callId) await client.del(key);
};

const reserveActiveCall = async (state, ttlSec = stateTtlSec) => {
  if (!state?.callId || !state?.roomId) {
    throw new Error('callId and roomId are required to reserve a call');
  }

  const ttl = clampTtl(ttlSec);
  const next = encodeState(state, ttl);
  const busyUserIds = getStateBusyUserIds(next);
  next.busyUserIds = busyUserIds;

  const client = await getRedis();
  if (!client) {
    const existingRoomCallId = memoryGet(roomKey(next.roomId));
    if (existingRoomCallId && existingRoomCallId !== next.callId) {
      return {
        reserved: false,
        reason: 'room-busy',
        existingCallId: existingRoomCallId,
      };
    }
    const busyUserId = busyUserIds.find((userId) => {
      const existing = memoryGet(userKey(userId));
      return existing && existing !== next.callId;
    });
    if (busyUserId) {
      return {
        reserved: false,
        reason: 'user-busy',
        busyUserId,
        existingCallId: memoryGet(userKey(busyUserId)),
      };
    }
    memorySet(roomKey(next.roomId), next.callId, ttl);
    busyUserIds.forEach((userId) => memorySet(userKey(userId), next.callId, ttl));
    memorySet(callKey(next.callId), next, ttl);
    return { reserved: true, state: next };
  }

  const roomReserved = await client.set(roomKey(next.roomId), next.callId, {
    NX: true,
    EX: ttl,
  });
  if (!roomReserved) {
    return {
      reserved: false,
      reason: 'room-busy',
      existingCallId: await client.get(roomKey(next.roomId)),
    };
  }

  const reservedUsers = [];
  try {
    for (const userId of busyUserIds) {
      const result = await client.set(userKey(userId), next.callId, {
        NX: true,
        EX: ttl,
      });
      if (!result) {
        const existingCallId = await client.get(userKey(userId));
        for (const reservedUserId of reservedUsers) {
          await releaseMappedKey(client, userKey(reservedUserId), next.callId);
        }
        await releaseMappedKey(client, roomKey(next.roomId), next.callId);
        return {
          reserved: false,
          reason: 'user-busy',
          busyUserId: userId,
          existingCallId,
        };
      }
      reservedUsers.push(userId);
    }

    await client.set(callKey(next.callId), JSON.stringify(next), { EX: ttl });
    return { reserved: true, state: next };
  } catch (error) {
    for (const reservedUserId of reservedUsers) {
      await releaseMappedKey(client, userKey(reservedUserId), next.callId).catch(
        () => {}
      );
    }
    await releaseMappedKey(client, roomKey(next.roomId), next.callId).catch(
      () => {}
    );
    throw error;
  }
};

const releaseUserBusy = async (userId, callId) => {
  if (!userId || !callId) return;
  const client = await getRedis();
  await releaseMappedKey(client, userKey(userId), callId);
};

const releaseActiveCall = async (stateOrCallId) => {
  const state =
    typeof stateOrCallId === 'string'
      ? await getCallStateById(stateOrCallId)
      : stateOrCallId;
  const callId =
    typeof stateOrCallId === 'string' ? stateOrCallId : stateOrCallId?.callId;
  if (!callId) return null;

  const client = await getRedis();
  if (state?.roomId) {
    await releaseMappedKey(client, roomKey(state.roomId), callId);
  }

  const userIds = unique([
    ...(Array.isArray(state?.participantIds) ? state.participantIds : []),
    ...(Array.isArray(state?.busyUserIds) ? state.busyUserIds : []),
    ...(Array.isArray(state?.rejectedUserIds) ? state.rejectedUserIds : []),
    state?.initiatorId,
  ]);
  for (const userId of userIds) {
    await releaseMappedKey(client, userKey(userId), callId);
  }

  if (client) await client.del(callKey(callId));
  else memoryDelete(callKey(callId));
  return state || null;
};

module.exports = {
  getCallStateTtlSec: () => stateTtlSec,
  getCallStateById,
  getActiveCallByRoom,
  getBusyCallId,
  saveActiveCall,
  reserveActiveCall,
  releaseUserBusy,
  releaseActiveCall,
};
