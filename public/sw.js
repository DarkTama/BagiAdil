const CACHE_NAME = 'bagiadil-v2';

// Resolve everything relative to the worker's own location so the app works
// under any base path (e.g. /BagiAdil/ on GitHub Pages).
const SCOPE_URL = new URL('./', self.location).href;
const INDEX_URL = new URL('index.html', SCOPE_URL).href;
const PRECACHE_URLS = ['./', './index.html', './manifest.json'].map(
  (path) => new URL(path, SCOPE_URL).href,
);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

// Network first for same-origin GETs; cache successful responses and fall back
// to the cache (or the cached index.html for navigations) when offline.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== new URL(SCOPE_URL).origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match(INDEX_URL);
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
