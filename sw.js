// Flight Crew Fitness — Service Worker
// Version: 5.48.3
const CACHE = 'fcf-v5.48.3';
const CORE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
];
// Third-party libraries index.html loads from jsDelivr. app.js calls
// supabase.createClient on its first line, so if these can't load the
// whole app fails to start. They have to be in the offline copy too.
// Keep this list in sync with the <script src> tags in index.html.
const CDN_LIBS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
];
const isCdnLib = url => CDN_LIBS.includes(url.href);

// BUG FIX (reported: "black screen that never fills in" in airplane mode on
// the iPhone, with the web copy saved and the app opened online that
// morning). In a desktop browser a request with no network fails at once,
// and the handlers below fall back to the saved copy. On the phone the same
// request can sit there, so the page waits on index.html or app.js and the
// screen stays dark. Two changes: when the device says it is offline the
// saved copy answers first and the network is not asked at all; otherwise
// the network gets a few seconds and the saved copy answers if it is slower.
const NETWORK_WAIT_MS = 6000;
const deviceOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('network timeout')), ms);
    fetch(request).then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // cache:'reload' bypasses the HTTP cache — without it, a freshly
      // installing SW can populate its new cache with a STALE app.js served
      // from the browser/CDN HTTP cache (GitHub Pages max-age is 10 min).
      .then(c => Promise.allSettled(CORE.concat(CDN_LIBS).map(url =>
        fetch(new Request(url, { cache: 'reload' })).then(res => {
          if (res.ok) return c.put(url, res);
        })
      )))
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
    url.pathname.startsWith('/crashpads/') ||   // separate app hosted under this site; never cache it
    url.pathname.startsWith('/blog/') ||        // static marketing pages; always fresh, never part of the offline app
    url.pathname.startsWith('/tools/') ||       // free public tools (medical calculator); same rule as the blog
    url.pathname === '/llms.txt' ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('ouraring.com') ||
    url.hostname.includes('google.com')
  );

  // The app's own libraries on jsDelivr: network first so updates arrive,
  // cached copy when offline. Checked before the passthrough list, which
  // matches jsdelivr.net for anything else loaded from there. The page
  // requests these without CORS, so the live response can be opaque
  // (status 0); that is still a valid copy to keep.
  if (isCdnLib(url)) {
    if (deviceOffline()) {
      e.respondWith(caches.match(url.href).then(hit => hit || fetch(e.request)));
      return;
    }
    e.respondWith(
      fetchWithTimeout(e.request, NETWORK_WAIT_MS).then(res => {
        if (res.ok || res.type === 'opaque') {
          const resClone = res.clone();
          caches.open(CACHE).then(c => c.put(url.href, resClone));
        }
        return res;
      }).catch(() => caches.match(url.href))
    );
    return;
  }

  if (isPassthrough) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Network-first for core app files — ensures WKWebView always gets the
  // latest version. Falls back to cache only when offline.
  const isCoreFile = (
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/app.js' ||
    url.pathname === '/sw.js'
  );

  if (isCoreFile) {
    const fromCache = () => caches.match(e.request, { ignoreSearch: true })
      .then(hit => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined));
    if (deviceOffline()) {
      e.respondWith(fromCache().then(hit => hit || fetch(e.request)));
      return;
    }
    e.respondWith(
      fetchWithTimeout(e.request, NETWORK_WAIT_MS).then(res => {
        if (res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, resClone));
        }
        return res;
      // ignoreSearch: index.html asks for app.js?v=<build>, but the install
      // step saves plain app.js. An exact match would miss it offline and
      // the app would never start. Navigations fall back to index.html.
      }).catch(() => fromCache())
    );
    return;
  }

  // Cache-first for everything else (fonts, icons, etc.)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (e.request.method === 'GET' && res.status === 200 &&
            url.hostname === self.location.hostname) {
          const resClone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, resClone));
        }
        return res;
      }).catch(() => {
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
