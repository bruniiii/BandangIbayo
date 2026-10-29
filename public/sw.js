// Bandang IBAYO service worker: lets the site be installed on a phone's home
// screen and shows a friendly page when there's no internet. Everything else
// always comes fresh from the network, so nothing goes stale.
const CACHE = 'ibayo-offline-v2';
const OFFLINE = ['/offline.html', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { pathname, origin } = new URL(event.request.url);
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  } else if (origin === self.location.origin && OFFLINE.includes(pathname)) {
    // The offline page's logo: fresh when online, saved copy when not.
    event.respondWith(fetch(event.request).catch(() => caches.match(pathname)));
  }
});
