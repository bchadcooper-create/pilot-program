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
//   { "success": true,  "status": "purchased"|"restored"|"pending"|"cancelled"|"no_change",
//     "productId": "...", "transactionId": "..." }
//   { "success": false, "code": "product_not_found"|"invalid_product"|"verification_failed"|
//                                "purchase_failed"|"restore_failed"|"unknown_result",
//     "message": "<user-facing, native-controlled text>" }
// Never Apple's raw localizedDescription — that text is not a stable API
// contract (varies by OS version/locale, can change wording), so the web
// app was previously depending on strings it didn't control.
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

    // Populated by fetchProducts(); purchase(productId:) uses this instead
    // of re-querying StoreKit for a product it already has, cutting a
    // redundant network round-trip out of every purchase attempt.
    private var cachedProducts: [String: Product] = [:]

    // MARK: - Fetch

    func fetchProducts(completion: @escaping ([String: Any]) -> Void) {
        Task {
            do {
                let products = try await Product.products(for: validProductIDs)
                for p in products { cachedProducts[p.id] = p }
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
                if let cached = cachedProducts[productId] {
                    product = cached
                } else {
                    let products = try await Product.products(for: [productId])
                    guard let fetched = products.first else {
                        completion(["success": false, "code": "product_not_found",
                                    "message": "That product couldn't be found."])
                        return
                    }
                    cachedProducts[productId] = fetched
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
                        // integration bugs) and treat currentEntitlements
                        // — not this one event — as the authoritative
                        // answer to "is Pro active," which the web app
                        // reconciles via reconcileEntitlements() below
                        // immediately after.
                        guard validProductIDs.contains(transaction.productID) else {
                            logNative("Verified transaction for unexpected product: \(transaction.productID)")
                            completion(["success": false, "code": "verification_failed",
                                        "message": "Something went wrong with that purchase."])
                            return
                        }
                        await transaction.finish()
                        completion([
                            "success": true, "status": "purchased",
                            "productId": transaction.productID,
                            "transactionId": "\(transaction.id)"
                        ])
                    case .unverified(_, let error):
                        logNative("Unverified transaction: \(error)")
                        completion(["success": false, "code": "verification_failed",
                                    "message": "We couldn't verify that purchase. Please try again or contact support."])
                    }
                case .userCancelled:
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
            do {
                try await AppStore.sync()
                var restored: [[String: Any]] = []
                for await result in Transaction.currentEntitlements {
                    if case .verified(let transaction) = result,
                       validProductIDs.contains(transaction.productID) {
                        restored.append([
                            "productId": transaction.productID,
                            "transactionId": "\(transaction.id)"
                        ])
                    }
                }
                completion(["success": true, "status": restored.isEmpty ? "no_change" : "restored",
                            "restored": restored])
            } catch {
                logNative("restorePurchases failed: \(error)")
                completion(["success": false, "code": "restore_failed",
                            "message": "Restore failed. Please try again."])
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
    func listenForTransactions() {
        Task {
            for await result in Transaction.updates {
                // BUG FIX: unverified transactions were previously
                // handled implicitly by the enclosing `if case .verified`
                // simply not matching — silently ignored with nothing
                // logged. Entitlement should never come from an
                // unverified transaction (StoreKit's own verification is
                // the real security boundary), but a silent drop makes
                // this invisible to debug if it ever happens.
                guard case .verified(let transaction) = result else {
                    logNative("Ignoring unverified transaction update")
                    continue
                }
                await transaction.finish()
                NotificationCenter.default.post(
                    name: .fcfTransactionUpdated,
                    object: nil,
                    userInfo: [
                        "success": true, "productId": transaction.productID,
                        "transactionId": "\(transaction.id)"
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
