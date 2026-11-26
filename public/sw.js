// Service Worker untuk Regex PWA.
// Strategi: cache-first untuk app shell (HTML, manifest, ikon), network-first
// dengan fallback cache untuk aset JS/CSS dan navigasi. Signaling WebSocket
// tidak lewat fetch event (protokol terpisah) sehingga selalu butuh jaringan.
// Pesan dan file pengguna tidak pernah di-cache (zero-storage, AGENTS §2.1).

const CACHE_NAME = 'regex-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.svg',
  '/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Cache-first untuk aset app shell yang sudah di-precache.
  if (PRECACHE_URLS.includes(url.pathname) || url.pathname.endsWith('.svg') || url.pathname.endsWith('.json')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Network-first dengan fallback cache untuk sisa aset (JS, CSS, navigasi HTML).
  event.respondWith(
    fetch(request).then((response) => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      return response;
    }).catch(() => caches.match(request))
  );
});
