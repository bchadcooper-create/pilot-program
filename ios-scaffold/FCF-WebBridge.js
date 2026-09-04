/**
 * FCF iOS Bridge — paste this into your web app JS
 *
 * Detects whether the page is running inside the FCF native wrapper
 * and exposes a clean API for IAP, Sign In with Apple, and push tokens.
 *
 * Usage:
 *   if (FCFBridge.isNative) { ... }
 *   FCFBridge.getProducts()
 *   FCFBridge.purchase('fit.flightcrew.app.pro.monthly')
 *   FCFBridge.restore()
 *   FCFBridge.signInWithApple()
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

  // ── Event listeners (native → web) ───────────────────────────────────────
  // Listen like: window.addEventListener('fcf:purchase', e => console.log(e.detail))

  // fcf:products    → { products: [...] }
  // fcf:purchase    → { success, productId, transactionId } | { cancelled } | { pending } | { error }
  // fcf:restore     → { restored: [...] }
  // fcf:siwa:success → { userId, identityToken, email?, givenName?, familyName? }
  // fcf:siwa:error   → { error }

  return { isNative, getProducts, purchase, restore, signInWithApple };
})();
