const CACHE = 'sojo-v28';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network first for the read-only roster actions specifically, with an
  // empty-object fallback when offline. login/checkAccess/writes are left
  // untouched so a real failure surfaces as a real error instead of being
  // silently masked -- a fake "success" here would be misread as a valid
  // (but unauthorized/empty) response, same bug class fixed elsewhere.
  if (e.request.url.includes('seniorfamily.org/sojo-api/')) {
    if (e.request.method === 'GET' && /action=(getConfig|getSingers)(&|$)/.test(e.request.url)) {
      e.respondWith(
        fetch(e.request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' }}))
      );
    }
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
