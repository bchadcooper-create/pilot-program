/**
 * FCF iOS Bridge — paste this into your web app JS
 *
 * Detects whether the page is running inside the FCF native wrapper
 * and exposes a clean API for IAP, Sign In with Apple, push tokens,
 * and HealthKit.
 *
 * Usage:
 *   if (FCFBridge.isNative) { ... }
 *   FCFBridge.getProducts()
 *   FCFBridge.purchase('fit.flightcrew.app.pro.monthly')
 *   FCFBridge.restore()
 *   FCFBridge.signInWithApple()
 *   FCFBridge.requestHealthKit()   // call once after login — shows iOS permission sheet
 *   FCFBridge.syncHealthKit()      // call to refresh data without re-prompting
 */

const FCFBridge = (() => {
  const isNative = !!(window.webkit?.messageHandlers?.storeKit);

  // ── helpers ──────────────────────────────────────────────────────────────

  function send(handler, payload) {
    window.webkit?.messageHandlers?.[handler]?.postMessage(payload);
  }

  // ── StoreKit ─────────────────────────────────────────────────────────────

  function getProducts() {
    send('storeKit', { action: 'getProducts' });
  }

  function purchase(productId) {
    send('storeKit', { action: 'purchase', productId });
  }

  function restore() {
    send('storeKit', { action: 'restore' });
  }

  // ── Sign In with Apple ───────────────────────────────────────────────────

  function signInWithApple() {
    send('signInWithApple', {});
  }

  // ── HealthKit ────────────────────────────────────────────────────────────
  // Call requestHealthKit() once after the user logs in. iOS will show
  // the Health permission sheet on first call; subsequent calls skip it.
  // Both functions post results back as a fcf:healthkit CustomEvent.

  function requestHealthKit() {
    send('healthkit', { action: 'requestPermission' });
  }

  function syncHealthKit() {
    send('healthkit', { action: 'sync' });
  }

  // ── Event listeners (native → web) ───────────────────────────────────────
  // Listen like: window.addEventListener('fcf:purchase', e => console.log(e.detail))

  // fcf:products      → { products: [...] }
  // fcf:purchase      → { success, productId, transactionId } | { cancelled } | { pending } | { error }
  // fcf:restore       → { restored: [...] }
  // fcf:siwa:success  → { userId, identityToken, email?, givenName?, familyName? }
  // fcf:siwa:error    → { error }
  // fcf:healthkit     → {
  //   available: bool,
  //   granted: bool,
  //   stepsToday?: number,
  //   activeCaloriesToday?: number,
  //   restingHR?: number,        restingHRSource?: string,
  //   hrv?: number,              hrvSource?: string,
  //   sleepMinutes?: number,     sleepSource?: string,
  //   lastWorkout?: { activityType, durationMinutes, calories, date },
  //   lastWorkoutSource?: string,
  //   detectedDevices?: [{ name: string, kind: 'appleWatch'|'oura'|'whoop'|'garmin'|'iphone'|'other' }]
  // }

  return { isNative, getProducts, purchase, restore, signInWithApple, requestHealthKit, syncHealthKit };
})();
