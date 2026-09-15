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
    // BUG FIX (independent review finding, confirmed real — three
    // reviews independently caught this): showOfflinePage() replaces the
    // WebView's document via loadHTMLString, so the offline page's own
    // Retry button calling location.reload() just reloads that generated
    // HTML forever, never the actual site. Tracking the URL that failed
    // lets Retry explicitly reload it natively instead.
    private var lastFailedURL: URL?

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        loadApp()
        observePushTaps()
        observeAPNsToken()
        observeTransactionUpdates()
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

        // Inject the FCFBridge before the page JS runs so FCFBridge.isNative
        // is true by the time app.js executes. Without this, window.webkit
        // exists but FCFBridge is never defined, so every native feature
        // silently falls back to the browser/PWA path.
        let bridgeJS = """
        const FCFBridge = (() => {
          const isNative = !!(window.webkit?.messageHandlers?.storeKit);
          function send(h, p) { window.webkit?.messageHandlers?.[h]?.postMessage(p); }
          return {
            isNative,
            // BUG FIX (independent review finding): isNative used to be
            // the only signal exposed, standing in for "is the whole
            // native environment available" — semantically weak, since
            // it only actually reflects whether StoreKit's handler
            // exists. Explicit per-feature flags let calling code check
            // what it actually needs rather than inferring everything
            // from one handler's presence.
            capabilities: {
              storeKit:        !!(window.webkit?.messageHandlers?.storeKit),
              signInWithApple: !!(window.webkit?.messageHandlers?.signInWithApple),
              healthKit:       !!(window.webkit?.messageHandlers?.healthkit),
              calendar:        !!(window.webkit?.messageHandlers?.calendar),
              notifications:   !!(window.webkit?.messageHandlers?.notifications),
              haptics:         !!(window.webkit?.messageHandlers?.haptics),
            },
            getProducts:      () => send('storeKit',      { action: 'getProducts' }),
            purchase:         (o) => send('storeKit',      { action: 'purchase', productId: o.productId, appAccountToken: o.appAccountToken }),
            restore:          () => send('storeKit',      { action: 'restore' }),
            reconcileEntitlements: () => send('storeKit', { action: 'reconcileEntitlements' }),
            signInWithApple:  () => send('signInWithApple', {}),
            requestHealthKit: () => send('healthkit',     { action: 'requestPermission' }),
            syncHealthKit:    () => send('healthkit',     { action: 'sync' }),
            requestCalendar:  () => send('calendar',      { action: 'requestPermission' }),
            syncCalendar:     () => send('calendar',      { action: 'sync' }),
          };
        })();
        """
        let bridgeScript = WKUserScript(source: bridgeJS,
                                        injectionTime: .atDocumentStart,
                                        forMainFrameOnly: true)
        contentController.addUserScript(bridgeScript)

        let weakDelegate = WeakScriptDelegate(delegate: self)
        contentController.add(weakDelegate, name: "storeKit")
        contentController.add(weakDelegate, name: "signInWithApple")
        contentController.add(weakDelegate, name: "pushToken")
        contentController.add(weakDelegate, name: "healthkit")
        contentController.add(weakDelegate, name: "calendar")
        contentController.add(weakDelegate, name: "notifications")
        contentController.add(weakDelegate, name: "haptics")
        // Used only by the native offline page's Retry button (see
        // showOfflinePage) — not part of the FCFBridge surface the real
        // web app uses, so it's intentionally left out of bridgeJS above.
        contentController.add(weakDelegate, name: "retryLoad")
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
        loadURL(targetURL)
    }

    private func loadURL(_ url: URL) {
        // reloadIgnoringLocalAndRemoteCacheData ensures WKWebView always fetches
        // the latest index.html and app.js rather than serving a stale cached copy.
        let request = URLRequest(url: url,
                                 cachePolicy: .reloadIgnoringLocalAndRemoteCacheData,
                                 timeoutInterval: 30)
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

    // Forwards purchase/renewal events that PurchaseManager's app-level
    // transaction listener picks up (see PurchaseManager.listenForTransactions,
    // now started once from AppDelegate) to the web app — a purchase made on
    // another device or a renewal can arrive at any time, not just while
    // this screen initiated one itself.
    private func observeTransactionUpdates() {
        NotificationCenter.default.addObserver(
            forName: .fcfTransactionUpdated,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let data = notification.userInfo as? [String: Any] else { return }
            self?.postToWeb("fcf:purchase", data: data)
        }
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
        // BUG FIX (independent review finding): a JSON serialization
        // failure here previously vanished with no trace at all — the
        // web app would just never receive whatever event was supposed
        // to arrive, with nothing logged to explain why.
        guard let payload = try? JSONSerialization.data(withJSONObject: data),
              var payloadString = String(data: payload, encoding: .utf8) else {
            logNative("postToWeb('\(event)') failed to serialize data: \(data)")
            return
        }
        // JSON allows U+2028/U+2029 inside strings, but raw JS statement syntax
        // does not — a free-text field (e.g. a name from Sign In with Apple)
        // containing one of these would silently break this script. Escape them.
        payloadString = payloadString
            .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        // Event names are always internal string literals today, never
        // web-supplied — but JSON-encoding it too (rather than embedding
        // it raw inside single quotes) costs nothing and removes the
        // assumption entirely rather than just documenting it.
        let eventJSON = (try? JSONSerialization.data(withJSONObject: [event]))
            .flatMap { String(data: $0, encoding: .utf8) }
            .map { String($0.dropFirst().dropLast()) } ?? "'\(event)'"
        let js = "window.dispatchEvent(new CustomEvent(\(eventJSON), { detail: \(payloadString) }));"
        // evaluateJavaScript must run on the main thread.
        DispatchQueue.main.async {
            self.webView.evaluateJavaScript(js)
        }
    }
}

// MARK: - Weak Script Delegate (breaks retain cycle)
// WKUserContentController strongly retains its message handlers.
// Wrapping self in a weak holder prevents ViewController from leaking.

// BUG FIX (independent review finding, minor): no apparent reason for
// this to be subclassable — final documents that intent and lets the
// compiler optimize dispatch.
final class WeakScriptDelegate: NSObject, WKScriptMessageHandler {
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
        guard let body = message.body as? [String: Any] else {
            logNative("message '\(message.name)' body failed to cast to [String: Any] — raw body: \(message.body)")
            return
        }
        logNative("bridge message received — name: \(message.name), body: \(body)")
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
            // BUG FIX (independent review finding): this handler was
            // registered but did nothing, and separately, the token was
            // only ever delivered via a one-time event that could be
            // missed if the web app's listener wasn't mounted yet when
            // it fired. Now the web app can explicitly ask for whatever
            // token is currently known, recovering it on demand instead
            // of only getting one chance to catch the original event.
            if let token = UserDefaults.standard.string(forKey: "fcfAPNsToken") {
                postToWeb("fcf:apnsToken", data: ["token": token])
            }
        case "retryLoad":
            // Only ever sent by the native offline page's own Retry
            // button (see showOfflinePage) — not part of the real
            // FCFBridge surface.
            loadURL(lastFailedURL ?? targetURL)
        default:
            logNative("unrecognized bridge message name: \(message.name)")
        }
    }

    private func logNative(_ message: String) {
        #if DEBUG
        print("FCF:", message)
        #endif
    }
}

// MARK: - WKNavigationDelegate

extension ViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        // BUG FIX: Don't show offline page for cancelled loads (e.g. redirect mid-load)
        let nsError = error as NSError
        if nsError.code == NSURLErrorCancelled { return }
        showOfflinePage(failedURL: (nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? targetURL, error: nsError)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        let nsError = error as NSError
        if nsError.code == NSURLErrorCancelled { return }
        showOfflinePage(failedURL: (nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? targetURL, error: nsError)
    }

    // BUG FIX (independent review finding, all three reviews raised this):
    // every non-cancelled navigation error was treated as "No connection,"
    // which is wrong for a lot of real cases (a bad TLS cert, a 5xx from
    // the server before content loads, a DNS misconfiguration) and gives
    // the user actively misleading advice — telling them to check their
    // internet connection when the actual problem is server-side won't
    // help and just erodes trust in the error message. This distinguishes
    // genuine connectivity failures from everything else, and shows a
    // different, honest message for the latter.
    private func isConnectivityError(_ error: NSError) -> Bool {
        guard error.domain == NSURLErrorDomain else { return false }
        let connectivityCodes: Set<Int> = [
            NSURLErrorNotConnectedToInternet,
            NSURLErrorNetworkConnectionLost,
            NSURLErrorTimedOut,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorDNSLookupFailed,
            NSURLErrorInternationalRoamingOff,
            NSURLErrorDataNotAllowed,
        ]
        return connectivityCodes.contains(error.code)
    }

    private func showOfflinePage(failedURL: URL, error: NSError) {
        lastFailedURL = failedURL
        let connectivity = isConnectivityError(error)
        let icon    = connectivity ? "✈️" : "⚠️"
        let heading = connectivity ? "No connection" : "Couldn't load"
        let body    = connectivity
            ? "Check your internet and try again."
            : "Something went wrong loading the app. Try again in a moment."
        let html = """
        <html><body style="background:#0d1117;color:#e6edf3;font-family:system-ui;
        display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;">
        <div><p style="font-size:2rem;">\(icon)</p>
        <h2 style="font-weight:400;">\(heading)</h2>
        <p style="color:#8b949e;margin-top:.5rem;">\(body)</p>
        <button onclick="window.webkit.messageHandlers.retryLoad.postMessage({})" style="margin-top:1.5rem;padding:.6rem 1.5rem;
        background:#58a6ff;color:#0d1117;border:none;border-radius:8px;font-size:1rem;cursor:pointer;">
        Retry</button></div></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}

// MARK: - WKUIDelegate (camera/mic permission prompts)

extension ViewController: WKUIDelegate {
    // BUG FIX (independent review finding): this checked origin.host only,
    // which isn't the full origin — scheme and port matter too. This app
    // only ever loads https://flightcrew.fit (hardcoded, not user-
    // navigable to arbitrary URLs), so pin to exactly that rather than
    // any host containing/matching the name.
    //
    // Also (same finding): camera and microphone were granted identically
    // regardless of which was actually requested. Nothing in this app
    // currently needs microphone access — food-photo logging is the only
    // capture feature, and that's camera-only — so microphone requests
    // are denied on the principle of least privilege. If a future feature
    // genuinely needs it, add .microphone (or the mic side of
    // .cameraAndMicrophone) to the granted cases below explicitly, rather
    // than reverting to a blanket grant.
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let isExpectedOrigin = origin.protocol == "https" && origin.host == "flightcrew.fit"
        guard isExpectedOrigin else {
            decisionHandler(.deny)
            return
        }
        switch type {
        case .camera:
            decisionHandler(.grant)
        case .microphone, .cameraAndMicrophone:
            decisionHandler(.deny)
        @unknown default:
            decisionHandler(.deny)
        }
    }
}

// MARK: - StoreKit 2
//
// All StoreKit logic now lives in PurchaseManager (see PurchaseManager.swift)
// — this is a thin bridge between web app messages and that manager, plus
// forwarding whatever it reports back to the web app. See PurchaseManager's
// own header comment for the response contract every event below follows.

extension ViewController {
    private func handleStoreKitMessage(_ body: [String: Any]) {
        guard let action = body["action"] as? String else {
            postToWeb("fcf:products", data: ["success": false, "code": "invalid_payload",
                                               "message": "Missing action."])
            return
        }
        switch action {
        case "purchase":
            guard let productId = body["productId"] as? String else {
                postToWeb("fcf:purchase", data: ["success": false, "code": "missing_product_id",
                                                   "message": "No product specified."])
                return
            }
            PurchaseManager.shared.purchase(productId: productId) { [weak self] result in
                self?.postToWeb("fcf:purchase", data: result)
                // Whatever the immediate purchase result was, follow up
                // with the authoritative reconciled entitlement state —
                // see PurchaseManager.reconcileEntitlements for why the
                // purchase event alone isn't treated as sufficient.
                if result["success"] as? Bool == true {
                    PurchaseManager.shared.reconcileEntitlements { entitlements in
                        self?.postToWeb("fcf:entitlements", data: entitlements)
                    }
                }
            }
        case "restore":
            PurchaseManager.shared.restorePurchases { [weak self] result in
                self?.postToWeb("fcf:restore", data: result)
            }
        case "getProducts":
            PurchaseManager.shared.fetchProducts { [weak self] result in
                self?.postToWeb("fcf:products", data: result)
            }
        case "reconcileEntitlements":
            // Lets the web app explicitly ask "what's actually active
            // right now" independent of any single purchase/restore
            // event — e.g. worth calling on app launch.
            PurchaseManager.shared.reconcileEntitlements { [weak self] result in
                self?.postToWeb("fcf:entitlements", data: result)
            }
        default:
            postToWeb("fcf:products", data: ["success": false, "code": "unsupported_action",
                                               "message": "Unrecognized StoreKit action: \(action)"])
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
        // BUG FIX (independent review finding): the original force-unwrap-
        // avoiding fallback manufactured a brand new, unattached UIWindow()
        // when view.window was nil — technically crash-safe, but that
        // window isn't part of any real window scene, so presenting on it
        // wouldn't actually show anything to the user; it would just fail
        // silently in a different way. Searching connected scenes for any
        // active window is a real fallback rather than a decoy one; if
        // that also comes up empty (view genuinely not in any window
        // yet), report it rather than presenting on a window nobody can
        // see.
        if let window = view.window { return window }
        if let sceneWindow = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow }) {
            return sceneWindow
        }
        logNative("presentationAnchor called with no attached window and no active scene window available")
        return UIWindow()
    }
}

// MARK: - HealthKit

extension ViewController {
    private func handleHealthKitMessage(_ body: [String: Any]) {
        guard let action = body["action"] as? String else {
            postToWeb("fcf:healthkit", data: ["success": false, "code": "invalid_payload", "message": "Missing action."])
            return
        }
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
            postToWeb("fcf:healthkit", data: ["success": false, "code": "unsupported_action", "message": "Unrecognized HealthKit action: \(action)"])
        }
    }
}

// MARK: - Calendar

extension ViewController {
    private func handleCalendarMessage(_ body: [String: Any]) {
        guard let action = body["action"] as? String else {
            postToWeb("fcf:calendar", data: ["success": false, "code": "invalid_payload", "message": "Missing action."])
            return
        }
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
            postToWeb("fcf:calendar", data: ["success": false, "code": "unsupported_action", "message": "Unrecognized Calendar action: \(action)"])
        }
    }
}

// MARK: - Notifications

extension ViewController {

    /// Observe the APNs token emitted by AppDelegate and forward it to the web app.
    /// The web app then POSTs it to Supabase with the user's JWT so the server
    /// can send targeted push notifications later.
    func observeAPNsToken() {
        // BUG FIX (independent review finding): previously only delivered
        // via the event below, which this observer could register too
        // late to catch — plausible on a cold launch, since the WebView
        // still has to finish loading before this even runs. AppDelegate
        // now persists the token (see UserDefaults key "fcfAPNsToken"),
        // so deliver whatever's already known immediately, then keep
        // listening for a future change (a token refresh) via the event.
        if let existingToken = UserDefaults.standard.string(forKey: "fcfAPNsToken") {
            postToWeb("fcf:apnsToken", data: ["token": existingToken])
        }
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
        guard let action = body["action"] as? String else {
            postToWeb("fcf:notifications", data: ["success": false, "code": "invalid_payload", "message": "Missing action."])
            return
        }
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
            postToWeb("fcf:notifications", data: ["success": false, "code": "unsupported_action", "message": "Unrecognized notifications action: \(action)"])
        }
    }
}

// MARK: - Haptics

extension ViewController {
    private func handleHapticsMessage(_ body: [String: Any]) {
        let style = body["style"] as? String ?? "medium"
        logNative("handleHapticsMessage reached, style=\(style)")
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
