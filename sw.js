// Flight Crew Fitness — Service Worker
// Version: 5.7
const CACHE = 'fcf-v5-7';
const CORE = [
  '/pilot-program/',
  '/pilot-program/index.html',
  '/pilot-program/app.js',
  '/pilot-program/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(CORE.map(url => c.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always pass these through to network directly — never cache or clone their responses
  const isPassthrough = (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('ouraring.com') ||
    url.hostname.includes('google.com')
  );

  if (isPassthrough) {
    // Simple network passthrough — do NOT attempt to cache or clone
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first for app shell files only
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Only cache successful GET responses for same-origin app files
        if (e.request.method === 'GET' && res.status === 200 &&
            url.hostname === self.location.hostname) {
          const resClone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, resClone));
        }
        return res;
      }).catch(() => {
        if (e.request.mode === 'navigate') {
          return caches.match('/pilot-program/index.html');
        }
      });
    })
  );
});
