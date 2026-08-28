import axios from 'axios';
import { setMaster, setSetting } from '../redux/features/user';
import { setRefreshInbox } from '../redux/features/chore';
import config from '../config';

const BOOT_CACHE_KEY = 'syncchat.local-first.boot.v1';
const DB_NAME = 'syncchat-local-first-v1';
const DB_STORE = 'responses';
const NETWORK_ONLY_HEADER = 'X-SyncChat-Network-Only';
const CACHE_HEADER = 'x-syncchat-local-cache';

const inFlight = new Map();

function tokenFingerprint(token) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${token.length}:${(hash >>> 0).toString(36)}`;
}

function safeParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error0) {
    return fallback;
  }
}

function readBootSnapshot(token) {
  const cached = safeParse(localStorage.getItem(BOOT_CACHE_KEY), null);
  if (!cached || cached.tokenFingerprint !== tokenFingerprint(token)) return null;
  return cached;
}

function writeBootSnapshot(token, patch) {
  if (!token) return;
  const fingerprint = tokenFingerprint(token);
  const previous = readBootSnapshot(token) || { tokenFingerprint: fingerprint };
  try {
    localStorage.setItem(
      BOOT_CACHE_KEY,
      JSON.stringify({
        ...previous,
        ...patch,
        tokenFingerprint: fingerprint,
        updatedAt: Date.now(),
      })
    );
  } catch (error0) {
    // Storage can be unavailable in hardened/private browser modes. Startup
    // must still fall back to the network rather than fail.
  }
}

function clearLocalFirstCache() {
  try {
    localStorage.removeItem(BOOT_CACHE_KEY);
  } catch (error0) {
    // Ignore storage cleanup failures.
  }
}

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function idbRead(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const request = tx.objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

async function idbWrite(key, value) {
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

function requestPath(requestConfig) {
  const raw = String(requestConfig?.url || '');
  try {
    return new URL(raw, 'https://syncchat.local').pathname.replace(/^\/api(?=\/)/, '');
  } catch (error0) {
    return raw.split('?')[0].replace(/^\/api(?=\/)/, '');
  }
}

function responsePayload(response) {
  return response?.data?.payload;
}

function cachedResponse(data, requestConfig) {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: { [CACHE_HEADER]: '1' },
    config: requestConfig,
    request: null,
  };
}

function sameValue(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch (error0) {
    return false;
  }
}

function applyAppConfig(payload = {}) {
  if (payload?.appName) {
    config.brandName = String(payload.appName);
    document.title = String(payload.appName);
  }
  if (payload?.appLogo) config.brandLogo = String(payload.appLogo);
  if (payload?.supportEmail) config.supportEmail = String(payload.supportEmail);
  if (payload?.featureFlags && typeof payload.featureFlags === 'object') {
    config.featureFlags = payload.featureFlags;
  }
  if (payload?.maintenance && typeof payload.maintenance === 'object') {
    config.maintenance = payload.maintenance;
  }
}

function cacheKey(token, resource) {
  return `${tokenFingerprint(token)}:${resource}`;
}

async function readCachedRoute(token, path) {
  const boot = readBootSnapshot(token);
  if (path === '/settings' && boot?.setting) {
    return { success: true, payload: boot.setting };
  }
  if (path === '/users' && boot?.master) {
    return { success: true, payload: boot.master };
  }
  if (path === '/app-config' && boot?.appConfig) {
    return { success: true, payload: boot.appConfig };
  }
  if (path === '/inboxes') {
    const cached = await idbRead(cacheKey(token, 'inboxes'));
    if (Array.isArray(cached?.payload)) {
      return { success: true, payload: cached.payload };
    }
  }
  return null;
}

async function persistRoute(token, path, response, store) {
  const payload = responsePayload(response);
  if (path === '/settings' && payload && typeof payload === 'object') {
    const previous = readBootSnapshot(token)?.setting;
    writeBootSnapshot(token, { setting: payload });
    document.body.classList[payload.dark ? 'add' : 'remove']('dark');
    if (!sameValue(previous, payload)) store.dispatch(setSetting(payload));
    return;
  }

  if (path === '/users' && payload && typeof payload === 'object') {
    const previous = readBootSnapshot(token)?.master;
    writeBootSnapshot(token, { master: payload });
    if (!sameValue(previous, payload)) store.dispatch(setMaster(payload));
    return;
  }

  if (path === '/app-config' && payload && typeof payload === 'object') {
    const previous = readBootSnapshot(token)?.appConfig;
    writeBootSnapshot(token, { appConfig: payload });
    applyAppConfig(payload);

    const previousMaintenance = previous?.maintenance || null;
    const nextMaintenance = payload?.maintenance || null;
    if (!sameValue(previousMaintenance, nextMaintenance)) {
      const reloadKey = `syncchat.app-config-reloaded:${JSON.stringify(nextMaintenance)}`;
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        setTimeout(() => window.location.reload(), 30);
      }
    }
    return;
  }

  if (path === '/inboxes' && Array.isArray(payload)) {
    const key = cacheKey(token, 'inboxes');
    const previous = await idbRead(key);
    await idbWrite(key, { payload, updatedAt: Date.now() });
    if (!sameValue(previous?.payload, payload)) {
      store.dispatch(setRefreshInbox(`local-first:${Date.now()}`));
    }
  }
}

function hydrateStore(token, store) {
  const snapshot = readBootSnapshot(token);
  if (!snapshot) return false;

  if (snapshot.setting && typeof snapshot.setting === 'object') {
    store.dispatch(setSetting(snapshot.setting));
    document.body.classList[snapshot.setting.dark ? 'add' : 'remove']('dark');
  }
  if (snapshot.master && typeof snapshot.master === 'object') {
    store.dispatch(setMaster(snapshot.master));
  }
  if (snapshot.appConfig && typeof snapshot.appConfig === 'object') {
    applyAppConfig(snapshot.appConfig);
  }
  return !!snapshot.master;
}

export default function installLocalFirstRuntime(store) {
  const token = localStorage.getItem('token') || '';
  if (!token) {
    clearLocalFirstCache();
    return () => {};
  }

  hydrateStore(token, store);

  const networkClient = axios.create({
    baseURL: axios.defaults.baseURL || config.apiBaseUrl,
    timeout: axios.defaults.timeout,
  });

  const revalidate = (path, requestConfig) => {
    const key = `${path}:${requestConfig?.params ? JSON.stringify(requestConfig.params) : ''}`;
    if (inFlight.has(key)) return inFlight.get(key);

    const task = networkClient
      .request({
        ...requestConfig,
        signal: undefined,
        adapter: undefined,
        headers: {
          ...(requestConfig.headers || {}),
          [NETWORK_ONLY_HEADER]: '1',
        },
      })
      .then(async (response) => {
        await persistRoute(token, path, response, store);
        return response;
      })
      .catch((error0) => {
        if (error0?.response?.status === 401) {
          clearLocalFirstCache();
          localStorage.removeItem('token');
          store.dispatch(setMaster(null));
          store.dispatch(setSetting(null));
          setTimeout(() => window.location.reload(), 20);
        }
        return null;
      })
      .finally(() => inFlight.delete(key));

    inFlight.set(key, task);
    return task;
  };

  const requestInterceptor = axios.interceptors.request.use(async (requestConfig) => {
    const method = String(requestConfig.method || 'get').toLowerCase();
    const path = requestPath(requestConfig);
    const networkOnly = requestConfig?.headers?.[NETWORK_ONLY_HEADER] === '1';
    const cacheable = ['/settings', '/users', '/app-config', '/inboxes'].includes(path);

    if (method !== 'get' || networkOnly || !cacheable) return requestConfig;

    const cached = await readCachedRoute(token, path);
    if (!cached) return requestConfig;

    requestConfig.adapter = async () => cachedResponse(cached, requestConfig);
    queueMicrotask(() => revalidate(path, requestConfig));
    return requestConfig;
  });

  const responseInterceptor = axios.interceptors.response.use(
    (response) => {
      const path = requestPath(response.config);
      const fromLocalCache = response?.headers?.[CACHE_HEADER] === '1';
      if (!fromLocalCache && ['/settings', '/users', '/app-config', '/inboxes'].includes(path)) {
        Promise.resolve(persistRoute(token, path, response, store)).catch(() => {});
      }
      return response;
    },
    (error0) => Promise.reject(error0)
  );

  let lastUserState = null;
  const unsubscribe = store.subscribe(() => {
    const state = store.getState()?.user || {};
    const snapshot = {
      master: state.master || null,
      setting: state.setting || null,
    };
    if (sameValue(lastUserState, snapshot)) return;
    lastUserState = snapshot;

    if (!localStorage.getItem('token')) {
      clearLocalFirstCache();
      return;
    }
    if (snapshot.master || snapshot.setting) writeBootSnapshot(token, snapshot);
  });

  return () => {
    unsubscribe();
    axios.interceptors.request.eject(requestInterceptor);
    axios.interceptors.response.eject(responseInterceptor);
  };
}
