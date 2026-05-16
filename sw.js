const CACHE_NAME = 'squidbaby-v2';
const APP_SHELL = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API pozivi — network first, bez keširanja (API ključ u URL-u)
  if (url.hostname.includes('newsapi.org') || url.hostname.includes('gnews.io')) {
    e.respondWith(fetch(e.request).catch(() => new Response('[]', { status: 503 })));
    return;
  }

  // App shell — cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      }
      return res;
    }))
  );
});

// Periodic Background Sync — osvježavanje svakih 12h čak i kad je app zatvorena
self.addEventListener('periodicsync', e => {
  if (e.tag === 'news-refresh') {
    e.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'BACKGROUND_REFRESH' }));
      })
    );
  }
});
