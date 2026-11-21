// QC Core — Root Service Worker
const CACHE = 'qc-core-v108';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Never cache orbital-slingshot or tetris assets or scripts (force network fetch with no-store)
  if (
    event.request.url.includes('/assets/orbital-slingshot-') ||
    event.request.url.includes('/assets/tetris-')
  ) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Standard runtime fetch handler
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
