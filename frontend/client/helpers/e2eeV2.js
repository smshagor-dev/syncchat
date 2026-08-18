import axios from 'axios';

const DB_NAME = 'syncchat-e2ee-v1';
const STORE_NAME = 'deviceKeys';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (input) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
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

const decodeJwt = () => {
  try {
    const token = localStorage.getItem('token') || '';
    const payload = token.split('.')[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch (error0) {
    return {};
  }
};

export const getCurrentIdentity = () => {
  const payload = decodeJwt();
  return {
    userId: String(payload._id || payload.id || payload.userId || ''),
    sessionId: String(payload.sid || ''),
  };
};

const openDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const dbGet = async (sessionId) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(sessionId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

const dbPut = async (value) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
};

const stableJwk = (jwk = {}) =>
  JSON.stringify({
    crv: jwk.crv || '',
    kty: jwk.kty || '',
    x: jwk.x || '',
    y: jwk.y || '',
  });

const fingerprintFor = async (publicJwk) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(stableJwk(publicJwk)));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const ensureDeviceKey = async ({ forceRegister = false } = {}) => {
  if (!window.crypto?.subtle || !window.indexedDB) {
    throw new Error('This browser does not support device E2EE');
  }

  const identity = getCurrentIdentity();
  if (!identity.userId || !identity.sessionId) {
    throw new Error('A linked device session is required for E2EE');
  }

  let record = await dbGet(identity.sessionId);
  if (!record?.privateKey || !record?.publicKey) {
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    record = {
      sessionId: identity.sessionId,
      userId: identity.userId,
      privateKey: pair.privateKey,
      publicKey: pair.publicKey,
      publicJwk,
      fingerprint: await fingerprintFor(publicJwk),
      createdAt: new Date().toISOString(),
      registeredAt: null,
    };
    await dbPut(record);
  }

  if (forceRegister || !record.registeredAt) {
    await axios.put('/chat-v2/e2ee/device-key', {
      publicJwk: record.publicJwk,
      fingerprint: record.fingerprint,
    });
    record = {
      ...record,
      registeredAt: new Date().toISOString(),
    };
    await dbPut(record);
  }

  return record;
};

const importPeerPublicKey = (jwk) =>
  crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

const deriveWrapKey = async ({ privateKey, publicKey, salt, info }) => {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
  const hkdfMaterial = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: encoder.encode(info),
    },
    hkdfMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptTextForRoom = async ({ text, roomId, userIds = [] }) => {
  const source = String(text || '');
  if (!source) return null;
  const current = await ensureDeviceKey();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.includes(current.userId)) ids.push(current.userId);

  const { data } = await axios.get('/chat-v2/e2ee/keys', {
    params: { userIds: ids.join(',') },
  });
  const peerKeys = Array.isArray(data?.payload) ? data.payload : [];
  const usersWithKeys = new Set(peerKeys.map((item) => String(item.userId || '')));
  const missing = ids.filter((id) => !usersWithKeys.has(String(id)));
  if (missing.length) {
    const error = new Error('Every participant must register an E2EE device before this message can be sent');
    error.code = 'E2EE_MISSING_DEVICE_KEYS';
    error.missingUserIds = missing;
    throw error;
  }

  const contentKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const rawContentKey = await crypto.subtle.exportKey('raw', contentKey);
  const messageIv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: messageIv },
    contentKey,
    encoder.encode(source)
  );

  const devices = [];
  for (const peer of peerKeys) {
    // One ephemeral key per target device prevents reuse across device envelopes.
    // eslint-disable-next-line no-await-in-loop
    const ephemeral = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    // eslint-disable-next-line no-await-in-loop
    const peerPublic = await importPeerPublicKey(peer.publicJwk);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const info = `syncchat-e2ee-v1:${roomId}:${peer.userId}:${peer.sessionId}`;
    // eslint-disable-next-line no-await-in-loop
    const wrapKey = await deriveWrapKey({
      privateKey: ephemeral.privateKey,
      publicKey: peerPublic,
      salt,
      info,
    });
    // eslint-disable-next-line no-await-in-loop
    const wrappedKey = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: wrapIv },
      wrapKey,
      rawContentKey
    );
    // eslint-disable-next-line no-await-in-loop
    const ephemeralPublicJwk = await crypto.subtle.exportKey('jwk', ephemeral.publicKey);
    devices.push({
      userId: peer.userId,
      sessionId: peer.sessionId,
      fingerprint: peer.fingerprint,
      ephemeralPublicJwk,
      salt: toBase64(salt),
      wrapIv: toBase64(wrapIv),
      wrappedKey: toBase64(wrappedKey),
    });
  }

  return {
    version: 1,
    algorithm: 'ECDH-P256+HKDF-SHA256+AES-256-GCM',
    roomId,
    messageIv: toBase64(messageIv),
    ciphertext: toBase64(ciphertext),
    devices,
  };
};

export const decryptEnvelope = async ({ envelope, roomId }) => {
  if (!envelope || Number(envelope.version) !== 1) return null;
  const current = await ensureDeviceKey();
  const target = (envelope.devices || []).find(
    (item) =>
      String(item.userId) === current.userId &&
      String(item.sessionId) === current.sessionId
  );
  if (!target) return null;

  const ephemeralPublic = await importPeerPublicKey(target.ephemeralPublicJwk);
  const wrapKey = await deriveWrapKey({
    privateKey: current.privateKey,
    publicKey: ephemeralPublic,
    salt: fromBase64(target.salt),
    info: `syncchat-e2ee-v1:${roomId}:${target.userId}:${target.sessionId}`,
  });
  const rawContentKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(target.wrapIv) },
    wrapKey,
    fromBase64(target.wrappedKey)
  );
  const contentKey = await crypto.subtle.importKey(
    'raw',
    rawContentKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.messageIv) },
    contentKey,
    fromBase64(envelope.ciphertext)
  );
  return decoder.decode(plaintext);
};

export const registerCurrentDeviceE2eeKey = () => ensureDeviceKey({ forceRegister: true });
