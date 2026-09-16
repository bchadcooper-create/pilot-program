import StoreKit
import Foundation

// MARK: - PurchaseManager
//
// Handles StoreKit 2 purchases, restoration, and entitlement state for
// Flight Crew Fitness. Extracted from ViewController following three
// independent code reviews that all flagged the same underlying issue:
// StoreKit was living inside ViewController, tangled with WebView/bridge
// code that has nothing to do with purchases, and the transaction
// listener's lifecycle was tied to a view controller instead of the app.
//
// Consistent response contract sent back to the web app for every
// StoreKit-originated event (purchase, restore, entitlement change):
//   { "success": true,  "status": "purchased"|"restored"|"pending"|"no_change",
//     "productId": "...", "transactionId": "...",
//     "activeProductIds": [...], "isPro": bool,
//     "expirationDate": <unix timestamp, seconds> }  // omitted when not applicable
//   { "success": false, "code": "product_not_found"|"invalid_product"|"verification_failed"|
//                                "purchase_failed"|"purchase_cancelled"|"restore_failed"|
//                                "unknown_result",
//     "message": "<user-facing, native-controlled text>" }
// Never Apple's raw localizedDescription — that text is not a stable API
// contract (varies by OS version/locale, can change wording), so the web
// app was previously depending on strings it didn't control.
//
// A follow-up independent review of this file (reviewing it in isolation,
// without ViewController.swift) found several real issues, fixed below,
// and two more that were flagged but turned out to already be handled by
// code in ViewController.swift the reviewer wasn't shown — worth stating
// plainly rather than silently fixing something that wasn't broken:
//   - "purchase callback and entitlement state can be briefly
//     inconsistent" — true in the abstract, but ViewController's
//     handleStoreKitMessage was already calling reconcileEntitlements
//     right after a successful purchase. Moved that logic IN here
//     instead (see purchase() below) so it's atomic rather than two
//     sequential events the web app has to sequence correctly itself —
//     a real improvement, just not the gap the review thought it was.
//   - "NotificationCenter post from a background Task could hand the
//     observer a background thread" — true of the post() call itself,
//     but ViewController's observer registers with `queue: .main`,
//     which guarantees the observer's closure runs on main regardless
//     of which thread posted it. No change needed there.
//
// A second follow-up review made the same two suggestions plus a
// genuinely important catch this file's own previous fix had introduced
// (see purchase()'s .verified case below) and confirmed the same
// postToWeb-already-dispatches-to-main point for its own "missing main
// thread dispatch" concern. Its suggested fix for both the concurrency
// and threading points was the same: mark this whole class @MainActor.
// Deliberately not doing that — it's a real option in principle, but
// none of this file's public methods are currently async, and marking
// the type actor-isolated would change call-site requirements for
// every caller (ViewController is not itself @MainActor) in ways I
// can't verify compile cleanly without an actual Xcode build. The
// NSLock already in place solves the specific data race that was
// identified, and postToWeb's own dispatch already covers the WebKit-
// threading requirement — a narrower fix for the same underlying
// concerns, chosen over a broader one I couldn't compile-check.
class PurchaseManager {

    static let shared = PurchaseManager()
    private init() {}

    // Single source of truth for what this app will actually attempt to
    // purchase or look up — previously fetchProducts() defined this list
    // but purchase(productId:) accepted any string the web layer sent,
    // with nothing to stop a malformed or unexpected request from
    // reaching StoreKit at all.
    private let validProductIDs: Set<String> = [
        "FCFProMonthly",
        "FCFProAnnual"
    ]

    // BUG FIX (independent review finding, confirmed real): a plain
    // dictionary mutated from multiple unstructured Tasks (fetchProducts
    // and purchase can both write to it, potentially concurrently — e.g.
    // the web layer calling getProducts and purchase in quick succession)
    // is a genuine data race under Swift's concurrency model. Considered
    // converting the whole type to an actor (the review's suggested fix)
    // but that changes call-site semantics in ways I can't verify compile
    // cleanly without an actual Xcode build — a plain lock achieves the
    // same safety with far less risk of a subtle isolation mistake.
    private let cacheLock = NSLock()
    private var cachedProducts: [String: Product] = [:]
    private func cachedProduct(for id: String) -> Product? {
        cacheLock.lock(); defer { cacheLock.unlock() }
        return cachedProducts[id]
    }
    private func setCachedProduct(_ product: Product, for id: String) {
        cacheLock.lock(); defer { cacheLock.unlock() }
        cachedProducts[id] = product
    }

    // Shared by purchase()'s success path, reconcileEntitlements(), and
    // listenForTransactions() — extracted so these three copies of the
    // same "what's actually entitled right now" walk can't drift out of
    // sync with each other, and so the expirationDate addition below only
    // needed to be made in one place.
    private func currentActiveEntitlements() async -> (ids: [String], expirationDate: Double?) {
        var active: [String] = []
        var expirationDate: Double? = nil
        for await result in Transaction.currentEntitlements {
            if case .verified(let t) = result,
               validProductIDs.contains(t.productID),
               t.revocationDate == nil {
                active.append(t.productID)
                // Unix timestamp (seconds) — a plain number is the
                // simplest thing for the web layer to consume directly.
                if let exp = t.expirationDate {
                    expirationDate = exp.timeIntervalSince1970
                }
            }
        }
        return (active, expirationDate)
    }

    // MARK: - Fetch

    func fetchProducts(completion: @escaping ([String: Any]) -> Void) {
        Task {
            do {
                let products = try await Product.products(for: validProductIDs)
                for p in products { setCachedProduct(p, for: p.id) }
                let data = products.map { p -> [String: Any] in
                    [
                        "id": p.id,
                        "displayName": p.displayName,
                        "description": p.description,
                        "displayPrice": p.displayPrice,
                    ]
                }
                completion(["products": data])
            } catch {
                completion(["success": false, "code": "product_lookup_failed",
                            "message": "Unable to load products. Please try again."])
                logNative("fetchProducts failed: \(error)")
            }
        }
    }

    // MARK: - Purchase

    // BUG FIX (independent review finding, confirmed and far more serious
    // than it first looked): the web app was already generating and
    // sending appAccountToken (its own Supabase user id) all the way
    // through the JS bridge — bridgeJS forwards it, app.js sets it
    // specifically for this purpose — but this method silently dropped
    // it, never passing it to StoreKit at all. Traced the actual
    // consequence: fcf-appstore-notifications (the ONLY thing that
    // grants Pro server-side) reads appAccountToken as its primary way
    // to attribute an Apple notification to a Supabase user, and its
    // fallback only works by matching an EXISTING row by
    // original_transaction_id — which doesn't exist yet for a brand-new
    // subscriber's very first notification. Net effect: a real purchase
    // made through the broken path could charge the customer via Apple
    // while never actually granting Pro server-side, with nothing
    // visibly wrong on the client to notice — especially easy to miss
    // during testing, since the dev account bypasses the real
    // subscriptions table entirely.
    func purchase(productId: String, appAccountToken: UUID? = nil, completion: @escaping ([String: Any]) -> Void) {
        // BUG FIX (independent review finding, confirmed real): this used
        // to accept whatever string the web layer sent and hand it
        // straight to StoreKit. Apple's own servers would ultimately
        // reject an invalid ID, but the native layer should be the one
        // defining which products it considers valid, not merely trust
        // whatever crosses the JS/native boundary.
        guard validProductIDs.contains(productId) else {
            completion(["success": false, "code": "invalid_product",
                        "message": "That product isn't recognized."])
            return
        }

        Task {
            do {
                let product: Product
                if let cached = cachedProduct(for: productId) {
                    product = cached
                } else {
                    let products = try await Product.products(for: [productId])
                    guard let fetched = products.first else {
                        completion(["success": false, "code": "product_not_found",
                                    "message": "That product couldn't be found."])
                        return
                    }
                    setCachedProduct(fetched, for: productId)
                    product = fetched
                }

                var options: Set<Product.PurchaseOption> = []
                if let token = appAccountToken { options.insert(.appAccountToken(token)) }
                let result = try await product.purchase(options: options)
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        // BUG FIX (independent review finding, confirmed
                        // real, and worse than it first looked): a
                        // verified transaction means StoreKit
                        // cryptographically confirmed the receipt — it
                        // does not by itself mean "this app's Pro
                        // entitlement should now be active," so this
                        // checks productID and revocationDate before
                        // deciding whether to grant it. The bug: this
                        // used to `return` on a failed check WITHOUT
                        // ever calling transaction.finish() — meaning an
                        // unexpected-product-ID or already-revoked
                        // transaction would never be acknowledged to
                        // StoreKit, so it gets redelivered on every
                        // future launch, fails the same check, and
                        // leaks again indefinitely. finish() has nothing
                        // to do with whether entitlement gets granted —
                        // it just means "I've handled this, stop
                        // redelivering it" — so it needs to happen
                        // regardless of which way these checks go.
                        await transaction.finish()
                        guard validProductIDs.contains(transaction.productID),
                              transaction.revocationDate == nil else {
                            logNative("Verified transaction failed post-checks for \(transaction.productID)")
                            completion(["success": false, "code": "verification_failed",
                                        "message": "Something went wrong with that purchase."])
                            return
                        }
                        // BUG FIX (independent review suggestion, "option
                        // a" — safer than the alternative): rather than
                        // the caller having to separately call
                        // reconcileEntitlements after seeing success here
                        // (which is what ViewController was doing before
                        // this), fold the reconciled state into this same
                        // response so it's one atomic answer instead of
                        // two events the web app has to sequence itself.
                        let entitlements = await self.currentActiveEntitlements()
                        var response: [String: Any] = [
                            "success": true, "status": "purchased",
                            "productId": transaction.productID,
                            "transactionId": "\(transaction.id)",
                            "activeProductIds": entitlements.ids, "isPro": !entitlements.ids.isEmpty
                        ]
                        // Only set when non-nil — an Optional cast directly
                        // to Any and inserted into a dictionary destined
                        // for JSONSerialization is a known footgun (it
                        // doesn't serialize the way a plain missing key
                        // does), so the key is simply omitted instead of
                        // trying to represent "no expiration" as a value.
                        if let exp = entitlements.expirationDate { response["expirationDate"] = exp }
                        completion(response)
                    case .unverified(let transaction, let error):
                        // BUG FIX (independent review finding, confirmed
                        // real): StoreKit expects every transaction it
                        // hands you to be finished once handled, verified
                        // or not — an unfinished one gets redelivered on
                        // the next launch or update, producing repeated
                        // "unverified" noise indefinitely. Not granting
                        // entitlement here is still correct; finishing it
                        // is a separate, required step.
                        await transaction.finish()
                        logNative("Unverified transaction: \(error)")
                        completion(["success": false, "code": "verification_failed",
                                    "message": "We couldn't verify that purchase. Please try again or contact support."])
                    }
                case .userCancelled:
                    // BUG FIX (independent review finding): the header
                    // comment above used to list "cancelled" as one of
                    // the success-shape's status values, but the code
                    // actually returns success:false with a code the
                    // header didn't even mention — genuine contract/
                    // implementation mismatch. Fixed the header to match
                    // what the code does rather than the other way
                    // around: a cancelled purchase is a "didn't happen"
                    // outcome, which the success:false shape already
                    // models correctly.
                    completion(["success": false, "code": "purchase_cancelled", "message": "Purchase cancelled."])
                case .pending:
                    completion(["success": true, "status": "pending",
                                "message": "Purchase pending approval (Ask to Buy or similar)."])
                @unknown default:
                    // BUG FIX (independent review finding): this used to
                    // be `break` — a future StoreKit result case would
                    // leave the web app with no response at all, waiting
                    // indefinitely for something that was never coming.
                    logNative("Unknown StoreKit purchase result for \(productId)")
                    completion(["success": false, "code": "unknown_result",
                                "message": "Something unexpected happened. Please try again."])
                }
            } catch {
                logNative("purchase(\(productId)) failed: \(error)")
                completion(["success": false, "code": "purchase_failed",
                            "message": "Purchase failed. Please try again."])
            }
        }
    }

    // MARK: - Restore

    func restorePurchases(completion: @escaping ([String: Any]) -> Void) {
        Task {
            // BUG FIX (independent review suggestion): AppStore.sync() is
            // network-dependent and can fail for reasons that don't mean
            // "nothing is entitled" — no connection, a transient App
            // Store outage. Transaction.currentEntitlements reflects the
            // last-synced local receipt data and doesn't itself require a
            // fresh network round trip, so falling back to it on a sync
            // failure can still correctly report a real subscription
            // that sync merely failed to refresh, rather than reporting
            // total failure when the user may well already be entitled.
            var syncFailed = false
            do {
                try await AppStore.sync()
            } catch {
                logNative("AppStore.sync() failed, falling back to currentEntitlements: \(error)")
                syncFailed = true
            }
            var restored: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result,
                   validProductIDs.contains(transaction.productID),
                   transaction.revocationDate == nil {
                    restored.append([
                        "productId": transaction.productID,
                        "transactionId": "\(transaction.id)"
                    ])
                }
            }
            if restored.isEmpty && syncFailed {
                completion(["success": false, "code": "restore_failed",
                            "message": "Restore failed. Please check your connection and try again."])
            } else {
                // Same consistency addition as purchase()/reconcileEntitlements —
                // activeProductIds/isPro/expirationDate alongside the
                // existing per-transaction `restored` detail list, so
                // every entitlement-related event carries the same shape
                // for "what's active now" regardless of which one it is.
                let entitlements = await self.currentActiveEntitlements()
                var response: [String: Any] = [
                    "success": true, "status": restored.isEmpty ? "no_change" : "restored",
                    "restored": restored,
                    "activeProductIds": entitlements.ids, "isPro": !entitlements.ids.isEmpty
                ]
                if let exp = entitlements.expirationDate { response["expirationDate"] = exp }
                completion(response)
            }
        }
    }

    // MARK: - Entitlement reconciliation
    //
    // BUG FIX (independent review finding, called the "biggest
    // architectural issue" by one review, echoed by both others): the
    // immediate purchase callback was being treated as the sole signal
    // for "Pro is active." That misses renewals, expirations, upgrades/
    // downgrades, purchases made on another device, and reinstalls. This
    // walks StoreKit's own current entitlements — the authoritative
    // answer — and reports what's actually active right now, independent
    // of whatever single event triggered the check.
    func reconcileEntitlements(completion: @escaping ([String: Any]) -> Void) {
        Task {
            let entitlements = await self.currentActiveEntitlements()
            var response: [String: Any] = ["success": true, "activeProductIds": entitlements.ids, "isPro": !entitlements.ids.isEmpty]
            if let exp = entitlements.expirationDate { response["expirationDate"] = exp }
            completion(response)
        }
    }

    // MARK: - Transaction listener
    //
    // BUG FIX (independent review finding): this lived in ViewController,
    // started from viewDidLoad — which fixed the earlier "defined but
    // never called" bug, but the ownership was still wrong. Transaction
    // updates are an app-level concern (a purchase made on another
    // device, a renewal, Ask to Buy approval can all arrive at any time,
    // independent of any particular screen being on screen), not
    // something that should stop mattering if a view controller is
    // dismissed or recreated. Now started once from AppDelegate at
    // launch instead.
    //
    // BUG FIX (independent review finding): guarded against being
    // started more than once — this is currently only ever called once,
    // from AppDelegate, but nothing previously stopped a future mistaken
    // second call from spawning a duplicate listener that would double-
    // post every transaction update to the web app.
    // BUG FIX (independent review suggestion): upgraded from a plain
    // Bool guard to holding the actual Task handle — still prevents a
    // second call from spawning a duplicate listener (the original bug
    // this was guarding against), but also makes the task inspectable/
    // cancellable if that's ever needed. Deliberately not adding a
    // deinit-based cancellation alongside it, despite that being the
    // usual pairing: PurchaseManager is a permanent `static let shared`
    // singleton that lives for the process's entire lifetime, so its
    // deinit would only run at process termination — at which point
    // every resource is being torn down by the OS regardless, making an
    // explicit cancel() there dead code that implies a lifecycle this
    // object doesn't actually have.
    private var listeningTask: Task<Void, Never>?
    func listenForTransactions() {
        guard listeningTask == nil else {
            logNative("listenForTransactions() called again — already listening, ignoring")
            return
        }
        listeningTask = Task {
            for await result in Transaction.updates {
                // BUG FIX: unverified transactions were previously
                // handled implicitly by the enclosing `if case .verified`
                // simply not matching — silently ignored with nothing
                // logged, and never finished (see the same fix in
                // purchase() above for why that matters).
                guard case .verified(let transaction) = result else {
                    if case .unverified(let transaction, let error) = result {
                        await transaction.finish()
                        logNative("Ignoring unverified transaction update: \(error)")
                    }
                    continue
                }
                await transaction.finish()
                // BUG FIX (independent review finding): this used to post
                // only productId + transactionId — too thin for the web
                // layer to tell a renewal from a revocation from a
                // routine update, or to know whether Pro is still active
                // afterward. Renewals, expirations, and revocations all
                // arrive here, so include the full reconciled entitlement
                // state in the same notification rather than making the
                // observer do a separate round trip to find out.
                let entitlements = await self.currentActiveEntitlements()
                var userInfo: [String: Any] = [
                    "success": true, "productId": transaction.productID,
                    "transactionId": "\(transaction.id)",
                    "activeProductIds": entitlements.ids, "isPro": !entitlements.ids.isEmpty
                ]
                if let exp = entitlements.expirationDate { userInfo["expirationDate"] = exp }
                NotificationCenter.default.post(name: .fcfTransactionUpdated, object: nil, userInfo: userInfo)
            }
        }
    }

    private func logNative(_ message: String) {
        #if DEBUG
        print("FCF PurchaseManager:", message)
        #endif
    }
}

extension Notification.Name {
    static let fcfTransactionUpdated = Notification.Name("fcfTransactionUpdated")
}

