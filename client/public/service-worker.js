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

self.addEventListener('fetch', event => {
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

