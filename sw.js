/* SolveCount — service worker.
 * App-shell precache + stale-while-revalidate for same-origin GET requests.
 * IndexedDB (all real data) is untouched by this file.
 */

const VERSION = 'v1.2.0';
const CACHE = `solvecount-${VERSION}`;

const SCOPE = self.registration.scope; // e.g. https://user.github.io/solvecount/
const P = (path) => new URL(path, SCOPE).toString();

const PRECACHE = [
  './', './index.html', './manifest.json',
  './core.css', './glass.css', './components.css', './animations.css',
  './app.js', './utils.js', './ui.js', './state.js', './storage.js',
  './camera.js', './addflow.js', './timeline.js', './home.js',
  './statistics.js', './history.js', './subjects.js', './settings.js',
  './mascot.js', './counter.js', './fx.js', './notify.js', './install.js',
  './timer.css', './timer-state.js', './timer-ui.js',
  './poppins-Medium.woff', './poppins-Bold.woff',
  './icon-192.png', './icon-512.png',
  './icon-maskable-192.png', './icon-maskable-512.png',
  './apple-touch-icon.png',
  './icon-mascot-happy.png', './icon-mascot-sleepy.png', './icon-mascot-excited.png',
  './icon-mascot-curious.png', './icon-mascot-celebrating.png', './badge-96.png'
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
    await self.registration.showNotification('🫣 Psst...', {
      body: 'Your mascot is still awake. Apparently it believes another question might happen.',
      tag: 'daily-reminder',
      icon: P('./icon-mascot-sleepy.png'),
      badge: P('./badge-96.png'),
      data: { route: 'home' },
      actions: [{ action: 'add', title: 'Add Question' }, { action: 'view-today', title: 'View Today' }]
    });
  })());
});

/* Route a notification (or one of its actions) back into the app: focus an open window and
 * postMessage the route, or open a fresh one with the route in the URL hash. */
const ROUTE_FOR_ACTION = {
  'view-today': 'home',
  'view-history': 'history',
  'view-stats': 'stats',
  add: 'add'
};

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = ROUTE_FOR_ACTION[event.action] || event.notification.data?.route || 'home';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window' });
    const existing = list.find((c) => c.url.startsWith(SCOPE));
    if (existing) {
      existing.focus();
      existing.postMessage({ type: 'sc-navigate', route });
      return;
    }
    return self.clients.openWindow(P(`./index.html#${route}`));
  })());
});
