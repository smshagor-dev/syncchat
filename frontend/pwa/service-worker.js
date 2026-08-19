const CACHE_VERSION = 'syncchat-v4';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/assets/icons/group-avatar.svg',
  '/assets/icons/channel-avatar.svg',
];

const LEGACY_AVATAR_REDIRECTS = new Map([
  ['/assets/images/default-group-avatar.png', '/assets/icons/group-avatar.svg'],
  ['/assets/images/default-channel-avatar.png', '/assets/icons/channel-avatar.svg'],
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('syncchat-') &&
                ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key)
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const isApiRequest = (url) =>
  url.pathname.startsWith('/api/') ||
  url.pathname.startsWith('/socket.io/') ||
  (url.pathname.startsWith('/admin/') && url.pathname.includes('/api/'));

const cacheResponse = async (request, response) => {
  if (!response || !response.ok || response.type === 'opaque') return response;
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, response.clone());
  return response;
};

const resolveLegacyAvatar = async (targetPath) => {
  const cached = await caches.match(targetPath);
  if (cached) return cached;
  const response = await fetch(targetPath, { credentials: 'same-origin' });
  return cacheResponse(targetPath, response);
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isApiRequest(url)) return;

  const legacyAvatarTarget = LEGACY_AVATAR_REDIRECTS.get(url.pathname);
  if (legacyAvatarTarget) {
    event.respondWith(resolveLegacyAvatar(legacyAvatarTarget));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(request, response))
        .catch(async () => (await caches.match(request)) || caches.match('/'))
    );
    return;
  }

  const cacheableDestination = ['script', 'style', 'image', 'font'].includes(
    request.destination
  );
  if (!cacheableDestination) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => cacheResponse(request, response))
        .catch(() => cached);
      return cached || network;
    })
  );
});

const normalizeCall = (payload = {}) => {
  const call = payload?.data?.call || payload?.call || {};
  if (!call.callId || !call.roomId) return null;
  return {
    callId: String(call.callId),
    roomId: String(call.roomId),
    roomType: call.roomType === 'group' ? 'group' : 'private',
    mediaType: call.mediaType === 'video' ? 'video' : 'audio',
    mediaMode: call.mediaMode === 'sfu' ? 'sfu' : undefined,
    fromUserId: String(call.fromUserId || ''),
    fromName: String(call.fromName || ''),
    fromUsername: String(call.fromUsername || ''),
    ringingTimeoutSec: Math.max(10, Number(call.ringingTimeoutSec || 45)),
  };
};

const buildCallLaunchUrl = (action, call) => {
  const params = new URLSearchParams();
  params.set('callAction', action || 'open');
  params.set('callId', call.callId);
  params.set('roomId', call.roomId);
  params.set('roomType', call.roomType);
  params.set('mediaType', call.mediaType);
  if (call.mediaMode) params.set('mediaMode', call.mediaMode);
  params.set('fromUserId', call.fromUserId || '');
  params.set('fromName', call.fromName || '');
  params.set('fromUsername', call.fromUsername || '');
  params.set('ringingTimeoutSec', String(call.ringingTimeoutSec || 45));
  return `/?${params.toString()}`;
};

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json?.() || {};
  } catch (error) {
    payload = { body: event.data?.text?.() || '' };
  }

  const call = normalizeCall(payload);
  const isIncomingCall =
    payload.category === 'call' &&
    payload?.data?.type === 'incoming_call' &&
    call;
  const title = payload.title || 'SyncChat';
  const options = {
    body: payload.body || payload.message || 'You have a new message.',
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-192x192.png',
    tag: isIncomingCall
      ? `syncchat-call-${call.callId}`
      : payload.tag || 'syncchat-message',
    data: {
      url: payload.url || payload.data?.url || '/',
      category: payload.category || 'message',
      ...(payload.data || {}),
    },
  };

  if (isIncomingCall) {
    options.requireInteraction = true;
    options.renotify = true;
    options.vibrate = [220, 120, 220, 120, 420];
    options.actions = [
      { action: 'accept-call', title: 'Accept' },
      { action: 'decline-call', title: 'Decline' },
    ];
    options.data.call = call;
  }

  event.waitUntil(
    (async () => {
      if (isIncomingCall) {
        const windows = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        const hasVisibleClient = windows.some(
          (client) => client.visibilityState === 'visible'
        );
        if (hasVisibleClient) return;
      }
      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification?.data || {};
  const call = data.category === 'call' ? normalizeCall({ data }) : null;
  const callAction =
    event.action === 'accept-call'
      ? 'accept'
      : event.action === 'decline-call'
        ? 'decline'
        : 'open';
  const targetUrl = call
    ? buildCallLaunchUrl(callAction, call)
    : data.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clients) => {
        const existing = clients.find((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch (error) {
            return false;
          }
        });

        if (existing) {
          if (call) {
            existing.postMessage({
              type: 'syncchat/call-action',
              action: callAction,
              call,
            });
          } else {
            await existing.navigate(targetUrl).catch(() => undefined);
          }
          return existing.focus();
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
