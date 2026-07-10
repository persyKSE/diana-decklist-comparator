/* Diana Deck Lab service worker — offline app shell + card-image cache. */
const VERSION = 'ddl-v12';
const SHELL = ['./', './index.html', './decks.js', './meta.js', './cards.js', './field.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Card images are effectively immutable: cache-first.
  if (url.pathname.includes('/cache/images/')) {
    e.respondWith(caches.open(VERSION).then(c =>
      c.match(e.request).then(hit => hit || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; }))
    ));
    return;
  }

  // App shell + data: network-first (so the weekly data update shows up),
  // falling back to cache — and to index.html for navigations — when offline.
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
