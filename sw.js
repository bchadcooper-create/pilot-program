// Flight Crew Fitness — Service Worker
// Version: 5.70.7
const CACHE = 'fcf-v5.70.7';
const CORE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './vendor/chart-4.4.1.umd.min.js',
  './vendor/supabase-2.119.0.umd.js',
];
// The one library still loaded from jsDelivr: the barcode scanner, which
// the app checks for before use. Chart.js and supabase-js moved to /vendor
// on this site (Nov 13 2026) and are in CORE above.
// Keep this list in sync with the <script src> tags in index.html.
const CDN_LIBS = [
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
// Opening the app itself (index.html and app.js) waits less (Nov 27 2026: Wi-Fi joined with no
// internet hangs instead of failing, so every second here is a second of
// white screen). A slow but working connection may get the saved copy for
// one open; the newer version is fetched in the background and used next time.
const NAV_NETWORK_WAIT_MS = 3000;
const deviceOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
// Startup log (Nov 27 2026: white screen opening the iPhone app in airplane
// mode, even after closing it). Each page open this worker handles is noted
// in its own small cache, which survives version changes, and the app sends
// the notes for the owner's account the next time it starts with signal.
// Timings and yes/no flags only.
const DIAG_CACHE = 'fcf-diag';
const DIAG_URL = '/__fcf_diag__/sw';
function diagNote(entry) {
  return caches.open(DIAG_CACHE).then(c => c.match(DIAG_URL)
    .then(old => old ? old.json() : []).catch(() => [])
    .then(list => { list.push(Object.assign({ t: new Date().toISOString(), v: CACHE }, entry)); return c.put(DIAG_URL, new Response(JSON.stringify(list.slice(-20)), { headers: { 'content-type': 'application/json' } })); }))
    .catch(() => {});
}
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
      // BUG FIX (found Nov 23 2026 while checking an offline white screen).
      // A failed download used to be ignored, and the new version took over
      // anyway and deleted the old saved copy. An update caught on a weak
      // signal could leave the phone with no saved app.js or index.html, so
      // the next launch without signal had nothing to start from. Now every
      // file of the app itself must be saved before the update takes over;
      // if one is missing, this update is dropped, the old version and its
      // complete saved copy stay in place, and the update is tried again
      // next time. The barcode library on jsDelivr stays optional.
      .then(c => Promise.all([
        Promise.all(CORE.map(url =>
          fetch(new Request(url, { cache: 'reload' })).then(res => {
            if (!res.ok) throw new Error('could not save ' + url + ' (' + res.status + ')');
            return c.put(url, res);
          })
        )),
        Promise.allSettled(CDN_LIBS.map(url =>
          fetch(new Request(url, { cache: 'reload' })).then(res => { if (res.ok) return c.put(url, res); })
        )),
      ]))
      .then(() => self.skipWaiting())
      .catch(err => caches.delete(CACHE).then(() => { throw err; }))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== DIAG_CACHE).map(k => caches.delete(k))))
      .then(() => diagNote({ kind: 'activate' }))
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
    url.pathname.startsWith('/vision') ||       // short links that forward to the free tools
    url.pathname.startsWith('/medical') ||
    url.pathname.startsWith('/meds') ||
    url.pathname.startsWith('/go/') ||          // short links that tag where a visitor came from
    url.pathname === '/llms.txt' ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('ouraring.com') ||
    url.hostname.includes('openstreetmap.org') || // street map tiles for route maps: never stored by the app
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

  // Passthrough: do not touch the request at all; the browser sends it as
  // if no service worker existed. Re-sending it with fetch(e.request) from
  // here can drop an upload body on the iPhone (reported Nov 1 2026:
  // progress photo "No content provided").
  if (isPassthrough) return;

  // Network-first for core app files — ensures WKWebView always gets the
  // latest version. Falls back to cache only when offline.
  const isCoreFile = (
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/app.js' ||
    url.pathname === '/sw.js'
  );

  if (isCoreFile) {
    const isNav = e.request.mode === 'navigate';
    const t0 = Date.now(), onLineAtStart = self.navigator ? self.navigator.onLine : null;
    const note = (src, res) => { if (isNav) diagNote({ kind: 'nav', src, ms: Date.now() - t0, onLine: onLineAtStart, cacheMode: e.request.cache, status: res ? res.status : null }); return res; };
    const fromCache = () => caches.match(e.request, { ignoreSearch: true })
      .then(hit => hit || (isNav ? caches.match('./index.html') : undefined))
      .then(hit => note(hit ? 'cache' : 'cache-miss', hit));
    if (deviceOffline()) {
      e.respondWith(fromCache().then(hit => hit || fetch(e.request)));
      return;
    }
    e.respondWith(
      fetchWithTimeout(e.request, NAV_NETWORK_WAIT_MS).then(res => {
        note('network', res);
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
