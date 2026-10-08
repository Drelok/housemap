'use strict';

// Keeps a copy of the app's own files so that it opens with no connection. The network is always
// tried first, so a connected browser runs the current files; the copy is only the fallback.
// Nothing from a project (plans, photos, quotes) ever passes through here.

// The preview of a change, published under /preview/, keeps its copy apart from the app's own.
const CACHE = self.registration.scope.includes('/preview/') ? 'housemap-preview' : 'housemap-app';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'js/boot.js', 'js/load.js',
  'js/tutorial.js', // the tutorial house: loaded only when it is opened, so it is not in load.js
  ...['util', 'store', 'plan', 'photos', 'aerial', 'tips', 'help', 'archive', 'interior', 'fixtures', 'canvas', 'panels', 'issues', 'search', 'print', 'brief', 'view3d', 'summary', 'house', 'maintenance', 'review', 'landing', 'tour', 'main'].map((n) => `js/${n}.js`),
];

// The page asks for its files at a fresh address each time (style.css?v=123); the copy is kept
// under the plain address.
const plain = (url) => url.split('?')[0];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response.ok) cache.put(plain(request.url), response.clone());
      return response;
    } catch (err) {
      const kept = await cache.match(plain(request.url));
      if (kept) return kept;
      throw err;
    }
  })());
});
