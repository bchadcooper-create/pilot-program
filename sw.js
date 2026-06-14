// Flight Crew Fitness — Service Worker
// Version Tracking Token: 1.1.0
// Caches the app shell for full offline support

const CACHE = 'fcf-v1.1.0';
const ASSETS = [
  '/pilot-program/',
  '/pilot-program/index.html',
  '/pilot-program/manifest.json',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];

// Install: cache all assets safely
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async cache => {
      console.log('Caching app shell...');
      
      const downloadPromises = ASSETS.map(async url => {
        try {
          const isRemote = url.startsWith('http');
          const response = await fetch(url, isRemote ? { mode: 'cors' } : {});
          
          if (response.status === 200 || response.status === 0) {
            await cache.put(url, response);
          } else {
            console.warn(`Failed to cache ${url} - Status: ${response.status}`);
          }
        } catch (err) {
          console.error(`Error fetching asset for cache: ${url}`, err);
        }
      });
      
      await Promise.all(downloadPromises);
      console.log('App shell caching cycle completed.');
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old versions instantly
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for app shell, network-first for API calls
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // FIX: Instantly reject Chrome Extensions or non-web schemas from cache routing
  if (!e.request.url.startsWith('http')) return;

  if (url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('{}', { 
        headers: { 'Content-Type': 'application/json' } 
      }))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(response => {
        if (e.request.method === 'GET' && (response.status === 200 || response.status === 0)) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        if (e.request.mode === 'navigate') {
          return caches.match('/pilot-program/index.html');
        }
      });
    })
  );
});

// Message listener to handle direct client skipWaiting overrides
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
