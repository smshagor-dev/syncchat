import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import socket from './socket';
import store from '../redux/store';
import { setChatRoom } from '../redux/features/room';
import { setRefreshInbox } from '../redux/features/chore';
import {
  decryptEnvelope,
  encryptTextForRoom,
  ensureDeviceKey,
} from './e2eeV2';

const DB_NAME = 'syncchat-chat-v2';
const DB_VERSION = 1;
const OUTBOX = 'outbox';
const ROOM_STATE = 'roomState';
const CACHE = 'messageCache';
let installed = false;
let rawEmit = null;
let interceptorId = null;
let flushing = false;

const openDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX)) {
        db.createObjectStore(OUTBOX, { keyPath: 'clientMessageId' });
      }
      if (!db.objectStoreNames.contains(ROOM_STATE)) {
        db.createObjectStore(ROOM_STATE, { keyPath: 'roomId' });
      }
      if (!db.objectStoreNames.contains(CACHE)) {
        const store0 = db.createObjectStore(CACHE, { keyPath: 'cacheId' });
        store0.createIndex('roomId', 'roomId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const idbPut = async (storeName, value) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
};

const idbDelete = async (storeName, key) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const idbGet = async (storeName, key) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

const idbGetAll = async (storeName) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

const idbGetRoomCache = async (roomId) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE, 'readonly');
    const store0 = tx.objectStore(CACHE);
    const index = store0.index('roomId');
    const request = index.getAll(roomId);
    request.onsuccess = () =>
      resolve(
        (request.result || [])
          .map((item) => item.chat)
          .filter(Boolean)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      );
    request.onerror = () => reject(request.error);
  });
};

const activeRoom = () => store.getState()?.room?.chat?.data || null;
const activeUserId = () => String(store.getState()?.user?.master?._id || '');

const topicFor = (roomId) =>
  String(localStorage.getItem(`syncchat:topic:${roomId}`) || '').trim() || null;

const saveRoomSequence = async (roomId, sequence) => {
  if (!roomId) return;
  const previous = await idbGet(ROOM_STATE, roomId).catch(() => null);
  const nextSequence = Math.max(Number(previous?.sequence || 0), Number(sequence || 0));
  await idbPut(ROOM_STATE, {
    roomId,
    sequence: nextSequence,
    updatedAt: new Date().toISOString(),
  }).catch(() => {});
};

const cacheMessage = async (chat) => {
  if (!chat?._id || !chat?.roomId || chat?.isSecretSystemMessage) return;
  await idbPut(CACHE, {
    cacheId: `${chat.roomId}:${chat._id}`,
    roomId: chat.roomId,
    chat,
    updatedAt: new Date().toISOString(),
  }).catch(() => {});
};

const cachePayload = async (value) => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    await Promise.all(value.map((item) => cachePayload(item)));
    return;
  }
  if (value._id && value.roomId && ('text' in value || value.fileId || value.file)) {
    await cacheMessage(value);
  }
  await Promise.all(
    Object.values(value)
      .filter((item) => item && typeof item === 'object')
      .map((item) => cachePayload(item))
  );
};

const decryptChatObject = async (value) => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Promise.all(value.map((item) => decryptChatObject(item)));

  let next = value;
  if (value.e2eeEnvelope && value.roomId) {
    try {
      const text = await decryptEnvelope({ envelope: value.e2eeEnvelope, roomId: value.roomId });
      if (text !== null) next = { ...value, text, e2eeDecrypted: true };
    } catch (error0) {
      next = { ...value, text: 'Encrypted message', e2eeDecryptionError: true };
    }
  }

  const output = { ...next };
  for (const key of Object.keys(output)) {
    if (key === 'e2eeEnvelope') continue;
    const item = output[key];
    if (item && typeof item === 'object') {
      // eslint-disable-next-line no-await-in-loop
      output[key] = await decryptChatObject(item);
    }
  }
  return output;
};

const refreshActiveRoom = () => {
  const state = store.getState();
  const chat = state?.room?.chat;
  if (!chat?.isOpen || !chat?.data) return;
  store.dispatch(
    setChatRoom({ ...chat, refreshId: uuidv4(), data: { ...chat.data } })
  );
};

const prepareOutgoing = async (source) => {
  const payload = { ...(source || {}) };
  payload.clientMessageId =
    String(payload.clientMessageId || '').trim() ||
    (crypto.randomUUID ? crypto.randomUUID() : uuidv4());
  payload.topicId = payload.topicId || topicFor(payload.roomId);

  const room = activeRoom();
  const e2eeEnabled =
    room?.roomId === payload.roomId && room?.roomType === 'private' && !!room?.e2eeEnabled;

  if (e2eeEnabled && String(payload.text || '').length > 0 && !payload.e2eeEnvelope) {
    const owners = Array.isArray(room?.ownersId)
      ? room.ownersId
      : Array.isArray(payload.ownersId)
        ? payload.ownersId
        : [];
    payload.e2eeEnvelope = await encryptTextForRoom({
      text: payload.text,
      roomId: payload.roomId,
      userIds: owners,
    });
    payload.text = 'Encrypted message';
  }
  return payload;
};

const sendOutboxItem = async (item) => {
  if (!socket.connected || !navigator.onLine || !rawEmit) return false;
  try {
    const payload = await prepareOutgoing(item.payload);
    await idbPut(OUTBOX, {
      ...item,
      payload,
      status: 'sending',
      attempts: Number(item.attempts || 0) + 1,
      lastAttemptAt: new Date().toISOString(),
    });
    rawEmit('chat/insert', payload);
    return true;
  } catch (error0) {
    await idbPut(OUTBOX, {
      ...item,
      status: 'failed',
      error: error0.message,
      updatedAt: new Date().toISOString(),
    });
    window.dispatchEvent(
      new CustomEvent('syncchat:outbox-failed', {
        detail: {
          clientMessageId: item.clientMessageId,
          roomId: item.payload?.roomId || null,
          message: error0.message,
        },
      })
    );
    return false;
  }
};

export const flushChatOutbox = async () => {
  if (flushing || !socket.connected || !navigator.onLine) return;
  flushing = true;
  try {
    const rows = (await idbGetAll(OUTBOX))
      .filter((item) => item.status !== 'failed' || item.retry === true)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      await sendOutboxItem(row);
    }
  } finally {
    flushing = false;
  }
};

export const retryOutboxMessage = async (clientMessageId) => {
  const item = await idbGet(OUTBOX, clientMessageId);
  if (!item) return false;
  await idbPut(OUTBOX, { ...item, status: 'queued', retry: true, error: '' });
  await flushChatOutbox();
  return true;
};

export const listOutboxMessages = () => idbGetAll(OUTBOX);
export const readOfflineRoomMessages = (roomId) => idbGetRoomCache(roomId);

const requestCatchUp = async () => {
  const room = activeRoom();
  if (!room?.roomId || !socket.connected || !rawEmit) return;
  const state = await idbGet(ROOM_STATE, room.roomId).catch(() => null);
  rawEmit(
    'chat/sync-request',
    { roomId: room.roomId, afterSequence: Number(state?.sequence || 0), limit: 200 },
    (result) => {
      if (!result?.success) return;
      saveRoomSequence(room.roomId, result.lastSequence || 0);
      if ((result.messages || []).length) refreshActiveRoom();
    }
  );
};

const sendReceipt = (chat, type = 'delivered') => {
  if (!chat?._id || !chat?.roomId || chat.userId === activeUserId() || !rawEmit) return;
  rawEmit('chat/receipt', { chatId: chat._id, roomId: chat.roomId, type });
};

const installResponseDecryption = () => {
  if (interceptorId !== null) return;
  interceptorId = axios.interceptors.response.use(
    async (response0) => {
      try {
        if (response0?.data?.payload) {
          // eslint-disable-next-line no-param-reassign
          response0.data.payload = await decryptChatObject(response0.data.payload);
          await cachePayload(response0.data.payload);
        }
      } catch (error0) {
        // Keep the HTTP response usable even if cache/decryption is unavailable.
      }
      return response0;
    },
    async (error0) => {
      const method = String(error0?.config?.method || '').toLowerCase();
      const url = String(error0?.config?.url || '');
      const match = url.match(/^\/chats\/([^/?]+)(?:\?|$)/);
      const reserved = new Set(['media', 'calls', 'starred', 'scheduled', 'upload', 'send-file']);
      if (
        !error0?.response &&
        method === 'get' &&
        match &&
        !reserved.has(match[1]) &&
        window.indexedDB
      ) {
        const cached = await idbGetRoomCache(match[1]).catch(() => []);
        if (cached.length) {
          return {
            data: {
              success: true,
              payload: cached,
              offline: true,
              message: `${cached.length} cached messages`,
            },
            status: 200,
            statusText: 'Offline Cache',
            headers: {},
            config: error0.config,
            request: error0.request,
          };
        }
      }
      return Promise.reject(error0);
    }
  );
};

const installReliableEmit = () => {
  if (socket.__syncchatV2EmitWrapped) return;
  socket.__syncchatV2EmitWrapped = true;
  rawEmit = socket.emit.bind(socket);
  // eslint-disable-next-line no-param-reassign
  socket.emit = (event, ...args) => {
    if (event !== 'chat/insert') return rawEmit(event, ...args);

    const source = args[0] && typeof args[0] === 'object' ? { ...args[0] } : {};
    const clientMessageId =
      String(source.clientMessageId || '').trim() ||
      (crypto.randomUUID ? crypto.randomUUID() : uuidv4());
    source.clientMessageId = clientMessageId;
    source.topicId = source.topicId || topicFor(source.roomId);

    idbPut(OUTBOX, {
      clientMessageId,
      payload: source,
      roomId: source.roomId || null,
      status: 'queued',
      retry: false,
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
      .then(() => flushChatOutbox())
      .catch(() => {});

    return socket;
  };
};

const installSocketListeners = () => {
  socket.on('connect', () => {
    ensureDeviceKey().catch(() => {});
    flushChatOutbox().catch(() => {});
    requestCatchUp().catch(() => {});
  });

  socket.on('chat/ack', async (payload = {}) => {
    if (!payload.clientMessageId) return;
    if (payload.accepted) {
      await idbDelete(OUTBOX, payload.clientMessageId).catch(() => {});
      await saveRoomSequence(payload.roomId, payload.sequence || 0);
      window.dispatchEvent(new CustomEvent('syncchat:outbox-sent', { detail: payload }));
    } else {
      const current = await idbGet(OUTBOX, payload.clientMessageId).catch(() => null);
      if (current) {
        await idbPut(OUTBOX, {
          ...current,
          status: 'failed',
          retry: false,
          error: payload.message || payload.code || 'Send failed',
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }
      window.dispatchEvent(new CustomEvent('syncchat:outbox-failed', { detail: payload }));
    }
  });

  socket.on('chat/meta', async (payload = {}) => {
    await saveRoomSequence(payload.roomId, payload.sequence || 0);
    if (payload.e2eeEnvelope && activeRoom()?.roomId === payload.roomId) refreshActiveRoom();
  });

  socket.on('chat/insert', async (chat) => {
    if (!chat?._id) return;
    await cacheMessage(chat);
    sendReceipt(chat, 'delivered');
    if (document.visibilityState === 'visible' && activeRoom()?.roomId === chat.roomId) {
      sendReceipt(chat, 'read');
    }
  });

  socket.on('chat/sync-result', async (result = {}) => {
    if (!result.success) return;
    await saveRoomSequence(result.roomId, result.lastSequence || 0);
    await Promise.all((result.messages || []).map((chat) => cacheMessage(chat)));
    if ((result.messages || []).length && activeRoom()?.roomId === result.roomId) refreshActiveRoom();
  });

  socket.on('message-request/new', () => store.dispatch(setRefreshInbox(uuidv4())));
  socket.on('message-request/updated', () => store.dispatch(setRefreshInbox(uuidv4())));
  socket.on('chat/mention', (payload) => {
    window.dispatchEvent(new CustomEvent('syncchat:mention', { detail: payload }));
  });

  window.addEventListener('online', () => flushChatOutbox().catch(() => {}));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestCatchUp().catch(() => {});
  });
};

const installChatTransportV2 = () => {
  if (installed) return;
  installed = true;
  if (!window.indexedDB) return;
  installResponseDecryption();
  installReliableEmit();
  installSocketListeners();
  ensureDeviceKey().catch(() => {});
};

export default installChatTransportV2;
