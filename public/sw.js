// Service Worker untuk Regex PWA.
// Strategi: cache-first untuk aset statis (manifest, ikon, favicon),
// network-first untuk HTML dan aset lain (JS/CSS). index.html SENGaja
// tidak di-cache supaya setiap deploy selalu dapat HTML fresh dengan
// referensi asset hash yang benar (mencegah white screen setelah deploy).
// Signaling WebSocket tidak lewat fetch event. Pesan dan file pengguna
// tidak pernah di-cache (zero-storage, AGENTS §2.1).

const CACHE_NAME = 'regex-v1';

// Aset statis yang di-cache. index.html dan / SENGaja DICANTUMKAN
// karena berubah setiap deploy (Vite mengubah referensi asset hash).
const PRECACHE_URLS = [
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

  // Cache-first untuk aset statis yang sudah di-precache.
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

  // Network-first untuk HTML, JS, CSS, dan sisa aset.
  // Cache respons berhasil untuk JS/CSS agar bisa digunakan offline nanti.
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    }).catch(() => caches.match(request))
  );
});
