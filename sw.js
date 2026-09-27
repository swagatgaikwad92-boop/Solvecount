/* SolveCount — service worker.
 * App-shell precache + stale-while-revalidate for same-origin GET requests.
 * IndexedDB (all real data) is untouched by this file.
 */

const VERSION = 'v1.0.0';
const CACHE = `solvecount-${VERSION}`;

const SCOPE = self.registration.scope; // e.g. https://user.github.io/solvecount/
const P = (path) => new URL(path, SCOPE).toString();

const PRECACHE = [
  './', './index.html', './manifest.json',
  './styles/core.css', './styles/glass.css', './styles/components.css', './styles/animations.css',
  './scripts/app.js', './scripts/utils.js', './scripts/ui.js', './scripts/state.js', './scripts/storage.js',
  './scripts/camera.js', './scripts/addflow.js', './scripts/timeline.js', './scripts/home.js',
  './scripts/statistics.js', './scripts/history.js', './scripts/subjects.js', './scripts/settings.js',
  './scripts/mascot.js', './scripts/counter.js', './scripts/fx.js', './scripts/notify.js', './scripts/install.js',
  './assets/fonts/poppins-Medium.woff', './assets/fonts/poppins-Bold.woff',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-192.png', './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png'
].map(P);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map((url) => cache.add(url).catch((e) => console.warn('precache miss', url, e))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('solvecount-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isNavigation(req) {
  return req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never intercept third-party requests

  if (isNavigation(request)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put(P('./index.html'), fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(P('./index.html'))) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request).then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

/* Best-effort daily reminder via Periodic Background Sync (Chrome/Android, installed apps only). */
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'solvecount-reminder') return;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window' });
    if (clientsList.length) return; // app is open — it handles its own reminder timing
    await self.registration.showNotification('Ready for a question or two?', {
      body: 'Your study trail is waiting. Snap one and watch it grow.',
      tag: 'daily-reminder',
      icon: P('./assets/icons/icon-192.png'),
      badge: P('./assets/icons/icon-192.png')
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window' });
    const existing = list.find((c) => c.url.startsWith(SCOPE));
    if (existing) return existing.focus();
    return self.clients.openWindow(P('./index.html'));
  })());
});
