const CACHE = 'sojo-v30';
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
  // Every sojo-api call (read or write) goes straight to the network,
  // completely unintercepted -- api.php always needs a live round trip
  // (auth, live roster data), so there's nothing useful to serve from
  // this cache for it either way. A previous version faked an empty `{}`
  // response here for getConfig/getSingers specifically on a failed
  // fetch, meant as an offline fallback -- but that made a real failure
  // (e.g. a transient network hiccup during the automatic background
  // refresh on open) look like a *successful* empty response to the
  // page, which corrupted the cached roster (app.js's own
  // fetchFromWeb() already handles a genuine rejection correctly, with
  // an offline banner and no cache corruption -- this was actively
  // working against that, not complementing it).
  if (e.request.url.includes('seniorfamily.org/sojo-api/')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
