const CACHE_NAME = "syncchat-cache-v1";
const urlsToCache = ["/", "/index.html", "/offline.html"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("Caching app shell...");
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", event => {
  const requestUrl = new URL(event.request.url);

  // Never intercept API/socket or non-GET requests.
  if (
    event.request.method !== "GET" ||
    requestUrl.pathname.startsWith("/api") ||
    requestUrl.pathname.startsWith("/socket.io") ||
    requestUrl.origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then(res => res || caches.match("/offline.html")))
  );
});

self.addEventListener("activate", event => {
  const whitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => (!whitelist.includes(key) ? caches.delete(key) : null)))
    )
  );
});

self.addEventListener('install', event => {
  console.log('Service Worker installed');
});

self.addEventListener('activate', event => {
  console.log('Service Worker activated');
});

self.addEventListener('message', event => {
  const { title, body } = event.data;
  self.registration.showNotification(title, {
    body,
    icon: 'pwa-192x192.png',
    badge: "pwa-72x72.png",
    vibrate: [200, 100, 200],
  });
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error0) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'SyncChat';
  const body = payload.body || 'You have a new message';
  const url = payload.url || '/';

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const hasFocused = clientsList.some(
        (client) =>
          client.visibilityState === 'visible' &&
          client.url &&
          client.url.startsWith(self.location.origin)
      );
      if (hasFocused) return;

      await self.registration.showNotification(title, {
        body,
        icon: 'pwa-192x192.png',
        badge: 'pwa-72x72.png',
        data: { url },
      });
    })()
  );
});

self.addEventListener('notificationclick', event => {
  const targetUrl = event.notification?.data?.url || '/';
  event.notification.close();

  event.waitUntil(
    (async () => {
      const absoluteUrl = new URL(targetUrl, self.location.origin).href;
      const clientsList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of clientsList) {
        if (client.url === absoluteUrl && 'focus' in client) {
          await client.focus();
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(absoluteUrl);
      }
    })()
  );
});
