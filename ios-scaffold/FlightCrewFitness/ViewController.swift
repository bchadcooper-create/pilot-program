import UIKit
import WebKit
import AuthenticationServices
import StoreKit
import HealthKit
import EventKit

class ViewController: UIViewController {

    // MARK: - Properties

    private var webView: WKWebView!
    private let targetURL = URL(string: "https://flightcrew.fit")!

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        loadApp()
        observePushTaps()
        observeAPNsToken()
        listenForTransactions()  // BUG FIX: was defined but never called
    }

    // MARK: - WebView Setup

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // BUG FIX: Use weak reference to avoid retain cycle.
        // contentController.add(self, ...) holds a strong ref to self.
        // Using a WeakScriptDelegate breaks the cycle.
        let contentController = WKUserContentController()
        let weakDelegate = WeakScriptDelegate(delegate: self)
        contentController.add(weakDelegate, name: "storeKit")
        contentController.add(weakDelegate, name: "signInWithApple")
        contentController.add(weakDelegate, name: "pushToken")
        contentController.add(weakDelegate, name: "healthkit")
        contentController.add(weakDelegate, name: "calendar")
        contentController.add(weakDelegate, name: "notifications")
        contentController.add(weakDelegate, name: "haptics")
        config.userContentController = contentController

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.bounces = false

        // BUG FIX: Pin to safeAreaLayoutGuide top so content isn't hidden under status bar
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    private func loadApp() {
        let request = URLRequest(url: targetURL, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30)
        webView.load(request)
    }

    // MARK: - Push Notification Deep Link

    private func observePushTaps() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handlePushTap(_:)),
            name: .fcfPushNotificationTapped,
            object: nil
        )
    }

    @objc private func handlePushTap(_ notification: Foundation.Notification) {
        guard let userInfo = notification.userInfo,
              let deepLink = userInfo["deepLink"] as? String else { return }
        // Post to the web app so it can switchTab() without reloading the page.
        // A full URL load would re-initialize the entire app and lose all state.
        var data: [String: Any] = ["tab": deepLink]
        if let type = userInfo["type"] as? String { data["type"] = type }
        postToWeb("fcf:pushTap", data: data)
    }

    // MARK: - JS → Native Bridge

    private func postToWeb(_ event: String, data: [String: Any]) {
        guard let payload = try? JSONSerialization.data(withJSONObject: data),
              var payloadString = String(data: payload, encoding: .utf8) else { return }
        // JSON allows U+2028/U+2029 inside strings, but raw JS statement syntax
        // does not — a free-text field (e.g. a name from Sign In with Apple)
        // containing one of these would silently break this script. Escape them.
        payloadString = payloadString
            .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        let js = "window.dispatchEvent(new CustomEvent('\(event)', { detail: \(payloadString) }));"
        // evaluateJavaScript must run on the main thread.
        DispatchQueue.main.async {
            self.webView.evaluateJavaScript(js)
        }
    }
}

// MARK: - Weak Script Delegate (breaks retain cycle)
// WKUserContentController strongly retains its message handlers.
// Wrapping self in a weak holder prevents ViewController from leaking.

class WeakScriptDelegate: NSObject, WKScriptMessageHandler {
    weak var delegate: (WKScriptMessageHandler & AnyObject)?
    init(delegate: WKScriptMessageHandler & AnyObject) {
        self.delegate = delegate
    }
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

// MARK: - WKScriptMessageHandler (JS → Native)

extension ViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        switch message.name {
        case "storeKit":
            handleStoreKitMessage(body)
        case "signInWithApple":
            handleSignInWithApple()
        case "healthkit":
            handleHealthKitMessage(body)
        case "calendar":
            handleCalendarMessage(body)
        case "notifications":
            handleNotificationsMessage(body)
        case "haptics":
            handleHapticsMessage(body)
        case "pushToken":
            break
        default:
            break
        }
    }
}

// MARK: - WKNavigationDelegate

extension ViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        // BUG FIX: Don't show offline page for cancelled loads (e.g. redirect mid-load)
        let nsError = error as NSError
        if nsError.code == NSURLErrorCancelled { return }
        showOfflinePage()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        let nsError = error as NSError
        if nsError.code == NSURLErrorCancelled { return }
        showOfflinePage()
    }

    private func showOfflinePage() {
        let html = """
        <html><body style="background:#0d1117;color:#e6edf3;font-family:system-ui;
        display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;">
        <div><p style="font-size:2rem;">✈️</p>
        <h2 style="font-weight:400;">No connection</h2>
        <p style="color:#8b949e;margin-top:.5rem;">Check your internet and try again.</p>
        <button onclick="location.reload()" style="margin-top:1.5rem;padding:.6rem 1.5rem;
        background:#58a6ff;color:#0d1117;border:none;border-radius:8px;font-size:1rem;cursor:pointer;">
        Retry</button></div></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}

// MARK: - WKUIDelegate (camera/mic permission prompts)

extension ViewController: WKUIDelegate {
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        if origin.host == "flightcrew.fit" {
            decisionHandler(.grant)
        } else {
            decisionHandler(.deny)
        }
    }
}

// MARK: - StoreKit 2

extension ViewController {
    private func handleStoreKitMessage(_ body: [String: Any]) {
        guard let action = body["action"] as? String else { return }
        switch action {
        case "purchase":
            if let productId = body["productId"] as? String {
                Task { await purchase(productId: productId) }
            }
        case "restore":
            Task { await restorePurchases() }
        case "getProducts":
            Task { await fetchProducts() }
        default:
            break
        }
    }

    private func fetchProducts() async {
        let productIds: Set<String> = [
            "fit.flightcrew.app.pro.monthly",
            "fit.flightcrew.app.pro.annual"
        ]
        do {
            let products = try await Product.products(for: productIds)
            let data = products.map { p -> [String: Any] in
                [
                    "id": p.id,
                    "displayName": p.displayName,
                    "description": p.description,
                    "displayPrice": p.displayPrice,
                    "price": "\(p.price)"
                ]
            }
            postToWeb("fcf:products", data: ["products": data])
        } catch {
            postToWeb("fcf:products", data: ["error": error.localizedDescription])
        }
    }

    private func purchase(productId: String) async {
        do {
            let products = try await Product.products(for: [productId])
            guard let product = products.first else {
                postToWeb("fcf:purchase", data: ["error": "Product not found"])
                return
            }
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                switch verification {
                case .verified(let transaction):
                    await transaction.finish()
                    postToWeb("fcf:purchase", data: [
                        "success": true,
                        "productId": transaction.productID,
                        "transactionId": "\(transaction.id)"
                    ])
                case .unverified(_, let error):
                    // BUG FIX: capture the error reason, was dropping it
                    postToWeb("fcf:purchase", data: ["error": "Verification failed: \(error.localizedDescription)"])
                }
            case .userCancelled:
                postToWeb("fcf:purchase", data: ["cancelled": true])
            case .pending:
                postToWeb("fcf:purchase", data: ["pending": true])
            @unknown default:
                break
            }
        } catch {
            postToWeb("fcf:purchase", data: ["error": error.localizedDescription])
        }
    }

    private func restorePurchases() async {
        do {
            try await AppStore.sync()
            var restored: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result {
                    restored.append([
                        "productId": transaction.productID,
                        "transactionId": "\(transaction.id)"
                    ])
                }
            }
            postToWeb("fcf:restore", data: ["restored": restored])
        } catch {
            postToWeb("fcf:restore", data: ["error": error.localizedDescription])
        }
    }

    // Called from viewDidLoad — handles purchases approved outside the app (Ask to Buy, etc.)
    func listenForTransactions() {
        Task {
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    await transaction.finish()
                    postToWeb("fcf:purchase", data: [
                        "success": true,
                        "productId": transaction.productID,
                        "transactionId": "\(transaction.id)"
                    ])
                }
            }
        }
    }
}

// MARK: - Sign In with Apple

extension ViewController: ASAuthorizationControllerDelegate,
                          ASAuthorizationControllerPresentationContextProviding {

    private func handleSignInWithApple() {
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else { return }

        var data: [String: Any] = ["userId": credential.user]
        if let identityToken = credential.identityToken,
           let tokenString = String(data: identityToken, encoding: .utf8) {
            data["identityToken"] = tokenString
        }
        if let authCode = credential.authorizationCode,
           let codeString = String(data: authCode, encoding: .utf8) {
            data["authorizationCode"] = codeString
        }
        if let fullName = credential.fullName {
            data["givenName"] = fullName.givenName ?? ""
            data["familyName"] = fullName.familyName ?? ""
        }
        if let email = credential.email {
            data["email"] = email
        }
        postToWeb("fcf:siwa:success", data: data)
    }

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithError error: Error) {
        // BUG FIX: Don't report user cancellation as an error to the web app
        if let authError = error as? ASAuthorizationError,
           authError.code == .canceled { return }
        postToWeb("fcf:siwa:error", data: ["error": error.localizedDescription])
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // BUG FIX: avoid a force-unwrap crash in the rare case this fires
        // before the view is attached to a window.
        return view.window ?? UIWindow()
    }
}

// MARK: - HealthKit

extension ViewController {
    private func handleHealthKitMessage(_ body: [String: Any]) {
        guard let action = body["action"] as? String else { return }
        switch action {
        case "requestPermission":
            // Called once after login. Shows the iOS Health permission sheet,
            // then immediately syncs and posts results back to the web app.
            HealthKitManager.shared.requestPermissionAndSync { [weak self] payload in
                self?.postToWeb("fcf:healthkit", data: payload)
            }
        case "sync":
            // Called by the web app to refresh data (e.g. when user opens
            // Connected Devices page). Skips the permission sheet — just reads.
            HealthKitManager.shared.syncAll { [weak self] payload in
                self?.postToWeb("fcf:healthkit", data: payload)
            }
        default:
            break
        }
    }
}

// MARK: - Calendar

extension ViewController {
    private func handleCalendarMessage(_ body: [String: Any]) {
        guard let action = body["action"] as? String else { return }
        switch action {
        case "requestPermission":
            CalendarManager.shared.requestPermissionAndSync { [weak self] payload in
                self?.postToWeb("fcf:calendar", data: payload)
            }
        case "sync":
            CalendarManager.shared.syncEvents { [weak self] payload in
                self?.postToWeb("fcf:calendar", data: payload)
            }
        default:
            break
        }
    }
}

// MARK: - Notifications

extension ViewController {

    /// Observe the APNs token emitted by AppDelegate and forward it to the web app.
    /// The web app then POSTs it to Supabase with the user's JWT so the server
    /// can send targeted push notifications later.
    func observeAPNsToken() {
        NotificationCenter.default.addObserver(
            forName: .fcfAPNsTokenReceived,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let token = notification.userInfo?["token"] as? String else { return }
            self?.postToWeb("fcf:apnsToken", data: ["token": token])
        }
    }

    private func handleNotificationsMessage(_ body: [String: Any]) {
        guard let action = body["action"] as? String else { return }
        switch action {
        case "schedule":
            // Web app sends full prefs + upcoming flights for preflight scheduling
            NotificationManager.shared.scheduleAll(prefs: body)
        case "cancelWorkoutReminder":
            // Called when user logs a workout — suppresses the 3-day nag
            NotificationManager.shared.cancelWorkoutReminder()
        case "cancelAll":
            NotificationManager.shared.cancelAll()
        default:
            break
        }
    }
}

// MARK: - Haptics

extension ViewController {
    private func handleHapticsMessage(_ body: [String: Any]) {
        let style = body["style"] as? String ?? "medium"
        DispatchQueue.main.async {
            switch style {
            case "light":
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            case "heavy":
                UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            case "soft":
                UIImpactFeedbackGenerator(style: .soft).impactOccurred()
            case "rigid":
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
            case "success":
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "warning":
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
            case "error":
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            case "selection":
                UISelectionFeedbackGenerator().selectionChanged()
            default: // "medium"
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            }
        }
    }
}
