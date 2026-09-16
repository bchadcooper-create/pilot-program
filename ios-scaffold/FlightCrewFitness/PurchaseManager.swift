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
//     "activeProductIds": [...], "isPro": bool }   // see note on purchase() below
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

    func purchase(productId: String, completion: @escaping ([String: Any]) -> Void) {
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

                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        // BUG FIX (independent review finding, several
                        // reviews called this "especially important"):
                        // a verified transaction means StoreKit
                        // cryptographically confirmed the receipt — it
                        // does not by itself mean "this app's Pro
                        // entitlement should now be active." Verify the
                        // productID matches what we expect (defensive;
                        // StoreKit's own verification is the real
                        // security boundary here, this just catches
                        // integration bugs), and check revocationDate
                        // too — same defensive check reconcileEntitlements
                        // already does below, added here for consistency
                        // even though a transaction being simultaneously
                        // revoked the instant it verifies is vanishingly
                        // unlikely in practice.
                        guard validProductIDs.contains(transaction.productID),
                              transaction.revocationDate == nil else {
                            logNative("Verified transaction failed post-checks for \(transaction.productID)")
                            completion(["success": false, "code": "verification_failed",
                                        "message": "Something went wrong with that purchase."])
                            return
                        }
                        await transaction.finish()
                        // BUG FIX (independent review suggestion, "option
                        // a" — safer than the alternative): rather than
                        // the caller having to separately call
                        // reconcileEntitlements after seeing success here
                        // (which is what ViewController was doing before
                        // this), fold the reconciled state into this same
                        // response so it's one atomic answer instead of
                        // two events the web app has to sequence itself.
                        var active: [String] = []
                        for await entResult in Transaction.currentEntitlements {
                            if case .verified(let t) = entResult,
                               validProductIDs.contains(t.productID),
                               t.revocationDate == nil {
                                active.append(t.productID)
                            }
                        }
                        completion([
                            "success": true, "status": "purchased",
                            "productId": transaction.productID,
                            "transactionId": "\(transaction.id)",
                            "activeProductIds": active, "isPro": !active.isEmpty
                        ])
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
                completion(["success": true, "status": restored.isEmpty ? "no_change" : "restored",
                            "restored": restored])
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
            var active: [String] = []
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result,
                   validProductIDs.contains(transaction.productID),
                   transaction.revocationDate == nil {
                    active.append(transaction.productID)
                }
            }
            completion(["success": true, "activeProductIds": active, "isPro": !active.isEmpty])
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
    private var isListening = false
    func listenForTransactions() {
        guard !isListening else {
            logNative("listenForTransactions() called again — already listening, ignoring")
            return
        }
        isListening = true
        Task {
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
                var active: [String] = []
                for await entResult in Transaction.currentEntitlements {
                    if case .verified(let t) = entResult,
                       self.validProductIDs.contains(t.productID),
                       t.revocationDate == nil {
                        active.append(t.productID)
                    }
                }
                NotificationCenter.default.post(
                    name: .fcfTransactionUpdated,
                    object: nil,
                    userInfo: [
                        "success": true, "productId": transaction.productID,
                        "transactionId": "\(transaction.id)",
                        "activeProductIds": active, "isPro": !active.isEmpty
                    ]
                )
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

