// Flight Crew Fitness — Service Worker
// Caches the app shell for full offline support

const CACHE = 'fcf-v1';
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
      
      // Map assets to fetch promises, accommodating for third-party Opaque responses
      const downloadPromises = ASSETS.map(async url => {
        try {
          // Use 'no-cors' for CDN assets if they fail standard fetching
          const isRemote = url.startsWith('http');
          const response = await fetch(url, isRemote ? { mode: 'cors' } : {});
          
          // Opaque responses have status 0. cache.put allows status 0, cache.add does not.
          if (response.status === 200 || response.status === 0) {
            await cache.put(url, response);
          } else {
            console.warn(`Failed to cache ${url} - Status: ${response.status}`);
          }
        } catch (err) {
          console.error(`Failed to fetch/cache ${url}:`, err);
        }
      });

      await Promise.all(downloadPromises);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
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

  // Always go to network for Supabase API calls
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('{}', { 
        headers: { 'Content-Type': 'application/json' } 
      }))
    );
    return;
  }

  // Cache-first for everything else (app shell, fonts, CDN scripts)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(response => {
        // Cache successful GET responses (status 200 or 0 for opaque CDN assets)
        if (e.request.method === 'GET' && (response.status === 200 || response.status === 0)) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback: return cached index.html for navigation requests
        if (e.request.mode === 'navigate') {
          return caches.match('/pilot-program/index.html');
        }
        // Return a generic network error response for assets that aren't navigation
        return new Response('Network error occurred', { status: 408, statusText: 'Network Error' });
      });
    })
  );
});
