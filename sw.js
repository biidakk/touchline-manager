// Service worker: makes the installed app work offline.
// Network first (so updates arrive as soon as you're online), falling back to
// the cached copy. Every file the game loads is cached as it is fetched; the
// whole game is loaded at start-up, so one visit online is enough.

const CACHE = 'touchline-v1';
const SHELL = ['./', './index.html', './css/theme.css', './src/ui/app.js', './manifest.webmanifest', './names.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The page sends the files it loaded before this worker took control.
self.addEventListener('message', (e) => {
  const urls = (e.data?.cache || []).filter((u) => new URL(u).origin === self.location.origin);
  if (urls.length) e.waitUntil(caches.open(CACHE).then((c) => Promise.all(urls.map((u) => c.add(u).catch(() => {})))));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' })
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })
    .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))));
});
