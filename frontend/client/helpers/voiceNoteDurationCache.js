const cache = new Map();
const STORAGE_KEY = 'syncchat.voice-duration-cache';

const readStorage = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error0) {
    return {};
  }
};

const writeStorage = () => {
  try {
    const payload = Object.fromEntries(cache.entries());
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error0) {
    // ignore storage failures
  }
};

const hydrateCache = () => {
  if (cache.size > 0) return;
  const payload = readStorage();
  Object.entries(payload).forEach(([key, value]) => {
    const safeDuration = Math.max(0, Number(value) || 0);
    if (key && safeDuration > 0) {
      cache.set(key, safeDuration);
    }
  });
};

export const rememberVoiceNoteDuration = (url, duration) => {
  hydrateCache();
  const key = String(url || '').trim();
  if (!key) return;
  const safeDuration = Math.max(0, Math.round(Number(duration) || 0));
  if (!safeDuration) return;
  cache.set(key, safeDuration);
  writeStorage();
};

export const readVoiceNoteDuration = (url) => {
  hydrateCache();
  const key = String(url || '').trim();
  if (!key) return 0;
  return Math.max(0, Number(cache.get(key)) || 0);
};
