/**
 * FCF iOS Bridge — paste this into your web app JS
 *
 * Detects whether the page is running inside the FCF native wrapper
 * and exposes a clean API for IAP, Sign In with Apple, push tokens,
 * HealthKit, and Calendar.
 *
 * NOTE: this is a standalone reference copy. The version actually
 * injected into the app is the bridgeJS string in ViewController.swift's
 * setupWebView() — keep both in sync when either changes.
 *
 * Usage:
 *   if (FCFBridge.isNative) { ... }
 *   if (FCFBridge.capabilities.healthKit) { ... }  // check a specific feature
 *   FCFBridge.getProducts()
 *   FCFBridge.purchase('FCFProMonthly')
 *   FCFBridge.restore()
 *   FCFBridge.reconcileEntitlements() // ask what's actually active right now,
 *                                      // independent of any one purchase event
 *   FCFBridge.signInWithApple()
 *   FCFBridge.requestHealthKit()   // call once after login — shows iOS permission sheet
 *   FCFBridge.syncHealthKit()      // refresh data without re-prompting
 *   FCFBridge.requestCalendar(ST.baseTimezone)  // call once after login — shows calendar permission sheet
 *   FCFBridge.syncCalendar(ST.baseTimezone)     // refresh calendar events without re-prompting
 */

const FCFBridge = (() => {
  const isNative = !!(window.webkit?.messageHandlers?.storeKit);

  // Explicit per-feature flags, rather than inferring the whole native
  // environment from one handler's presence (isNative above is kept for
  // backward compatibility, but prefer checking a specific capability
  // when the code only actually needs that one feature).
  const capabilities = {
    storeKit:        !!(window.webkit?.messageHandlers?.storeKit),
    signInWithApple: !!(window.webkit?.messageHandlers?.signInWithApple),
    healthKit:       !!(window.webkit?.messageHandlers?.healthkit),
    calendar:        !!(window.webkit?.messageHandlers?.calendar),
    notifications:   !!(window.webkit?.messageHandlers?.notifications),
    haptics:         !!(window.webkit?.messageHandlers?.haptics),
  };

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

  function reconcileEntitlements() {
    send('storeKit', { action: 'reconcileEntitlements' });
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

  // ── Calendar ──────────────────────────────────────────────────────────────
  // Call requestCalendar() once after login. iOS shows the Calendar permission
  // sheet on first call. Results arrive as a fcf:calendar CustomEvent with
  // the raw event list — the web app then sends them to the AI classifier.
  //
  // baseTimezone: an IANA identifier (e.g. "America/Phoenix") or "auto" —
  // the pilot's home base, used to correct a real upstream bug in the
  // crew-schedule sync tool that stamps event times using the base
  // timezone but mislabels them as UTC. "auto" (or omitting the argument)
  // falls back to the device's current timezone, which is only correct
  // while at home base — pass the user's actual saved preference here.

  function requestCalendar(baseTimezone) {
    send('calendar', { action: 'requestPermission', baseTimezone });
  }

  function syncCalendar(baseTimezone) {
    send('calendar', { action: 'sync', baseTimezone });
  }

  // ── Event listeners (native → web) ───────────────────────────────────────
  // Listen like: window.addEventListener('fcf:purchase', e => console.log(e.detail))
  //
  // Every StoreKit event below now follows one consistent shape:
  //   success case: { success: true, status: "purchased"|"restored"|"pending"|"no_change",
  //                   productId?, transactionId? }
  //   error case:   { success: false, code: "product_not_found"|"invalid_product"|
  //                                         "verification_failed"|"purchase_failed"|
  //                                         "purchase_cancelled"|"restore_failed"|
  //                                         "unknown_result"|"unsupported_action"|
  //                                         "invalid_payload"|"missing_product_id",
  //                   message: <stable, native-controlled user-facing text —
  //                             never Apple's raw localizedDescription, which
  //                             isn't a stable API contract> }
  // Any other bridge event (healthkit, calendar, notifications) that hits an
  // unrecognized or malformed action follows the same { success: false, code,
  // message } shape rather than silently doing nothing.

  // fcf:products      → { products: [{ id, displayName, description, displayPrice }] } | error shape above
  // fcf:purchase      → success/error shape above (success case now also includes
  //                      activeProductIds/isPro/expirationDate — the reconciled
  //                      entitlement state, folded in atomically rather than
  //                      requiring a separate reconcileEntitlements() round trip
  //                      after a purchase). Can also arrive UNPROMPTED — not just
  //                      as a direct response to calling purchase() — when a
  //                      renewal, expiration, or revocation is picked up by the
  //                      app-level transaction listener while the app happens to
  //                      be open.
  // fcf:restore       → { success: true, status, restored: [...],
  //                        activeProductIds, isPro, expirationDate? } | error shape above
  // fcf:entitlements  → { success: true, activeProductIds: [...], isPro: bool,
  //                        expirationDate?: <unix timestamp, seconds> }
  //                      (response to reconcileEntitlements() specifically)
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
  // fcf:calendar      → {
  //   granted: bool,
  //   events: [{ id, title, calendar, isAllDay, start, end, location?, notes? }],
  //   eventCount: number,
  //   calendarNames: string[],
  //   fingerprint: string,
  //   windowStart: string,   // ISO8601 — 7 days ago
  //   windowEnd: string      // ISO8601 — 60 days from now
  // }

  return { isNative, capabilities, getProducts, purchase, restore, reconcileEntitlements,
           signInWithApple, requestHealthKit, syncHealthKit, requestCalendar, syncCalendar };
})();
