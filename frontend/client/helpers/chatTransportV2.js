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
const DB_VERSION = 2;
const OUTBOX = 'outbox';
const ROOM_STATE = 'roomState';
const CACHE = 'messageCache';
const LOCAL_KEYS = 'localKeys';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let installed = false;
let rawEmit = null;
let interceptorId = null;
let flushing = false;

const toBase64 = (value) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const fromBase64 = (value = '') => {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

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
      if (!db.objectStoreNames.contains(LOCAL_KEYS)) {
        db.createObjectStore(LOCAL_KEYS, { keyPath: 'id' });
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

const getLocalOutboxKey = async () => {
  const existing = await idbGet(LOCAL_KEYS, 'e2ee-outbox');
  if (existing?.key) return existing.key;
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  await idbPut(LOCAL_KEYS, {
    id: 'e2ee-outbox',
    key,
    createdAt: new Date().toISOString(),
  });
  return key;
};

const sealLocalPayload = async (payload) => {
  const key = await getLocalOutboxKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(payload || {}))
  );
  return {
    __sealedE2eeOutbox: true,
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  };
};

const unsealLocalPayload = async (payload) => {
  if (!payload?.__sealedE2eeOutbox) return payload || {};
  const key = await getLocalOutboxKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) },
    key,
    fromBase64(payload.ciphertext)
  );
  return JSON.parse(decoder.decode(plaintext));
};

const activeRoom = () => store.getState()?.room?.chat?.data || null;
const activeUserId = () => String(store.getState()?.user?.master?._id || '');

const topicFor = (roomId) =>
  String(localStorage.getItem(`syncchat:topic:${roomId}`) || '').trim() || null;

const isCurrentRoomE2ee = (roomId) => {
  const room = activeRoom();
  return !!(
    room?.roomId === roomId &&
    room?.roomType === 'private' &&
    room?.e2eeEnabled
  );
};

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

const isSensitiveEphemeralMessage = (chat) =>
  !!(
    chat?.secret ||
    chat?.encryptedText ||
    chat?.encryptionSessionId ||
    chat?.expiresAt ||
    chat?.isSecretSystemMessage ||
    chat?.viewOnce ||
    (chat?.viewOnceType && chat.viewOnceType !== 'none')
  );

const canCacheRawChat = (chat) => {
  if (!chat?._id || !chat?.roomId) return false;
  if (isSensitiveEphemeralMessage(chat)) return false;
  if (chat?.e2eeDecrypted) return false;
  if (chat?.e2eeEnvelope) return true;
  if (String(chat?.text || '') === 'Encrypted message') return false;
  return true;
};

const cacheRawMessage = async (chat) => {
  if (!canCacheRawChat(chat)) return;
  await idbPut(CACHE, {
    cacheId: `${chat.roomId}:${chat._id}`,
    roomId: chat.roomId,
    chat,
    updatedAt: new Date().toISOString(),
  }).catch(() => {});
};

const cacheRawPayload = async (value, seen = new Set()) => {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    await Promise.all(value.map((item) => cacheRawPayload(item, seen)));
    return;
  }
  if (value._id && value.roomId && ('text' in value || value.fileId || value.file)) {
    await cacheRawMessage(value);
  }
  await Promise.all(
    Object.values(value)
      .filter((item) => item && typeof item === 'object')
      .map((item) => cacheRawPayload(item, seen))
  );
};

const decryptChatObject = async (value) => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Promise.all(value.map((item) => decryptChatObject(item)));

  let next = value;
  if (value.e2eeEnvelope && value.roomId) {
    try {
      const text = await decryptEnvelope({
        envelope: value.e2eeEnvelope,
        roomId: value.roomId,
      });
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

  if (
    isCurrentRoomE2ee(payload.roomId) &&
    String(payload.text || '').length > 0 &&
    !payload.e2eeEnvelope
  ) {
    const room = activeRoom();
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
    const sourcePayload = await unsealLocalPayload(item.payload);
    const payload = await prepareOutgoing(sourcePayload);
    await idbPut(OUTBOX, {
      ...item,
      payload,
      encryptedForTransport: !!payload.e2eeEnvelope,
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
      retry: false,
      error: error0.message,
      updatedAt: new Date().toISOString(),
    });
    window.dispatchEvent(
      new CustomEvent('syncchat:outbox-failed', {
        detail: {
          clientMessageId: item.clientMessageId,
          roomId: item.roomId || null,
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
      // Preserve message order while reconnecting.
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
  await idbPut(OUTBOX, {
    ...item,
    status: 'queued',
    retry: true,
    error: '',
    updatedAt: new Date().toISOString(),
  });
  await flushChatOutbox();
  return true;
};

export const listOutboxMessages = async () => {
  const rows = await idbGetAll(OUTBOX);
  return rows.map((item) => ({
    ...item,
    payload: item.payload?.__sealedE2eeOutbox
      ? { text: '[Encrypted queued message]' }
      : item.payload,
  }));
};

export const readOfflineRoomMessages = async (roomId) =>
  decryptChatObject(await idbGetRoomCache(roomId));

const requestCatchUp = async () => {
  const room = activeRoom();
  if (!room?.roomId || !socket.connected || !rawEmit) return;
  const state = await idbGet(ROOM_STATE, room.roomId).catch(() => null);
  rawEmit(
    'chat/sync-request',
    {
      roomId: room.roomId,
      afterSequence: Number(state?.sequence || 0),
      limit: 200,
    },
    (result) => {
      if (!result?.success) return;
      saveRoomSequence(room.roomId, result.lastSequence || 0);
      Promise.all((result.messages || []).map((chat) => cacheRawMessage(chat))).catch(() => {});
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
          const rawPayload = response0.data.payload;
          await cacheRawPayload(rawPayload);
          // eslint-disable-next-line no-param-reassign
          response0.data.payload = await decryptChatObject(rawPayload);
        }
      } catch (error0) {
        // Keep the HTTP response usable if optional cache/decryption is unavailable.
      }
      return response0;
    },
    async (error0) => {
      const method = String(error0?.config?.method || '').toLowerCase();
      const url = String(error0?.config?.url || '');
      const match = url.match(/^\/chats\/([^/?]+)(?:\?|$)/);
      const reserved = new Set([
        'media',
        'calls',
        'starred',
        'scheduled',
        'upload',
        'send-file',
      ]);
      if (
        !error0?.response &&
        method === 'get' &&
        match &&
        !reserved.has(match[1]) &&
        window.indexedDB
      ) {
        const cachedRaw = await idbGetRoomCache(match[1]).catch(() => []);
        const cached = await decryptChatObject(cachedRaw).catch(() => cachedRaw);
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

const queueOutgoing = async (source) => {
  const clientMessageId =
    String(source.clientMessageId || '').trim() ||
    (crypto.randomUUID ? crypto.randomUUID() : uuidv4());
  const payload = {
    ...source,
    clientMessageId,
    topicId: source.topicId || topicFor(source.roomId),
  };
  const isE2ee = isCurrentRoomE2ee(payload.roomId);
  const storedPayload = isE2ee ? await sealLocalPayload(payload) : payload;

  await idbPut(OUTBOX, {
    clientMessageId,
    payload: storedPayload,
    roomId: payload.roomId || null,
    isE2ee,
    status: 'queued',
    retry: false,
    attempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await flushChatOutbox();
};

const installReliableEmit = () => {
  if (socket.__syncchatV2EmitWrapped) return;
  socket.__syncchatV2EmitWrapped = true;
  rawEmit = socket.emit.bind(socket);
  // eslint-disable-next-line no-param-reassign
  socket.emit = (event, ...args) => {
    if (event !== 'chat/insert') return rawEmit(event, ...args);

    const source = args[0] && typeof args[0] === 'object' ? { ...args[0] } : {};
    queueOutgoing(source).catch((error0) => {
      window.dispatchEvent(
        new CustomEvent('syncchat:outbox-failed', {
          detail: {
            roomId: source.roomId || null,
            message: error0.message,
          },
        })
      );
    });
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
      window.dispatchEvent(
        new CustomEvent('syncchat:outbox-sent', { detail: payload })
      );
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
      window.dispatchEvent(
        new CustomEvent('syncchat:outbox-failed', { detail: payload })
      );
    }
  });

  socket.on('chat/meta', async (payload = {}) => {
    await saveRoomSequence(payload.roomId, payload.sequence || 0);
    if (payload.e2eeEnvelope && activeRoom()?.roomId === payload.roomId) {
      refreshActiveRoom();
    }
  });

  socket.on('chat/insert', async (chat) => {
    if (!chat?._id) return;
    await cacheRawMessage(chat);
    sendReceipt(chat, 'delivered');
    if (
      document.visibilityState === 'visible' &&
      activeRoom()?.roomId === chat.roomId
    ) {
      sendReceipt(chat, 'read');
    }
  });

  socket.on('chat/sync-result', async (result = {}) => {
    if (!result.success) return;
    await saveRoomSequence(result.roomId, result.lastSequence || 0);
    await Promise.all((result.messages || []).map((chat) => cacheRawMessage(chat)));
    if (
      (result.messages || []).length &&
      activeRoom()?.roomId === result.roomId
    ) {
      refreshActiveRoom();
    }
  });

  socket.on('message-request/new', () => {
    store.dispatch(setRefreshInbox(uuidv4()));
  });
  socket.on('message-request/updated', () => {
    store.dispatch(setRefreshInbox(uuidv4()));
  });
  socket.on('chat/mention', (payload) => {
    window.dispatchEvent(new CustomEvent('syncchat:mention', { detail: payload }));
  });

  window.addEventListener('online', () => {
    flushChatOutbox().catch(() => {});
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      requestCatchUp().catch(() => {});
    }
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
