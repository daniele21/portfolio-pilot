/* Basic service worker for PortfolioPilot PWA */
const CACHE_VERSION = 'v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/portfolio_manager_192x192.png',
  '/icons/portfolio_manager_512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
    ))
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Strategy: Network-first for API, cache-first for static.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        // Cache successful static responses
        if (resp.ok && resp.headers.get('Content-Type')?.includes('text') || resp.url.endsWith('.js') || resp.url.endsWith('.css')) {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
        }
        return resp;
      });
    })
  );
});
