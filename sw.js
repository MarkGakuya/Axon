const CACHE = 'axon-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js'
];

// On install: cache all core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      return Promise.allSettled(ASSETS.map(url => c.add(url)));
    }).then(() => self.skipWaiting())
  );
});

// On activate: delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Same-origin requests: cache-first, fallback to network, cache new responses
// - External requests (fonts, API): network-first, fallback to cache
// - API calls to Anthropic: always network (never cache)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never cache Anthropic API calls
  if (url.hostname === 'api.anthropic.com') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Never cache Google Fonts CSS (but do cache the font files)
  if (url.hostname === 'fonts.googleapis.com') {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match(e.request).then(cached => {
          const networkFetch = fetch(e.request).then(res => {
            c.put(e.request, res.clone());
            return res;
          });
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // Cache-first for everything else (app shell, fonts, etc.)
  e.respondWith(
    caches.open(CACHE).then(c =>
      c.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          // Cache valid responses
          if (res && res.status === 200) {
            c.put(e.request, res.clone());
          }
          return res;
        }).catch(() => {
          // Offline fallback: return app shell
          return caches.match('./index.html');
        });
      })
    )
  );
});

// Push notifications
self.addEventListener('push', e => {
  let d = { title: '⚡ AXON', body: 'You have something coming up.' };
  try { d = e.data.json(); } catch(err) {}
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: './icon.png',
      badge: './icon.png',
      vibrate: [200, 100, 200],
      data: { url: './' },
      actions: [
        { action: 'open', title: 'Open AXON' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      if (list.length) return list[0].focus();
      return clients.openWindow('./');
    })
  );
});
