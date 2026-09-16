import UIKit
import UserNotifications
import AVFoundation

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        configureAudioSession()
        registerForPushNotifications()
        // BUG FIX (independent review finding): previously started from
        // ViewController's viewDidLoad, which fixed the earlier "defined
        // but never called" bug but left the wrong lifecycle owner —
        // transaction updates (a renewal, a purchase on another device,
        // Ask to Buy approval) are an app-level concern, not tied to any
        // particular screen being alive. Started once, here, at launch.
        PurchaseManager.shared.listenForTransactions()
        return true
    }

    // MARK: - Audio Session
    // BUG FIX (reported: rest-timer/workout chimes never audible). AVAudioSession
    // was never configured anywhere in the app, so Web Audio content played
    // inside the WKWebView used whatever the system default category is —
    // which respects the phone's physical Ring/Silent switch. A workout timer
    // going off is exactly the kind of alert that should play even in silent
    // mode (the same reasoning Apple's own Clock app timer uses) — .playback
    // is the category that ignores the switch.
    private func configureAudioSession() {
        do {
            // BUG FIX (independent review finding, confirmed real): plain
            // .playback with no options forces this app's audio session to
            // interrupt and stop whatever else is already playing in the
            // background (Spotify, a podcast, Apple Music) the moment the
            // WebView's Web Audio content (workout timer chimes) makes any
            // sound. .mixWithOthers lets the chime play without silencing
            // whatever the user already had going. (Deliberately not
            // deferring setActive(true) to some later "right before
            // playback" call site, despite that being the usual advice —
            // there isn't one here: the chime itself is played from JS
            // inside the WebView, not from a discrete native call this app
            // controls, so a single process-level activation at launch is
            // the only hook actually available in this architecture.)
            try AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("FCF: audio session configuration failed:", error)
        }
    }

    // MARK: - Push Notifications

    private func registerForPushNotifications() {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .badge, .sound, .timeSensitive]
        ) { granted, error in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        // BUG FIX (independent review finding): the APNs token was only
        // ever delivered via a one-time NotificationCenter post. If
        // ViewController's observer registered even slightly after this
        // fired — plausible on a cold launch, since the WebView still
        // has to load before the web app's own listeners are ready — the
        // token was gone, with no way to recover it short of the OS
        // re-issuing one. Persisting it means it's always recoverable on
        // demand (see ViewController.observeAPNsToken), not just
        // deliverable at the exact moment this method happens to run.
        UserDefaults.standard.set(token, forKey: "fcfAPNsToken")
        // Still posted for the "token changed while the app is already
        // running" case (rare, but real — e.g. after a token refresh).
        NotificationCenter.default.post(
            name: .fcfAPNsTokenReceived,
            object: nil,
            userInfo: ["token": token]
        )
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs registration failed: \(error)")
    }

    // MARK: - UISceneSession

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension AppDelegate: UNUserNotificationCenterDelegate {
    // Show notifications even when app is in foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .badge, .sound])
    }

    // Handle notification tap — route deep link to web app
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        NotificationCenter.default.post(name: .fcfPushNotificationTapped, object: nil, userInfo: userInfo)
        completionHandler()
    }
}

extension Notification.Name {
    static let fcfPushNotificationTapped = Notification.Name("fcfPushNotificationTapped")
    static let fcfAPNsTokenReceived      = Notification.Name("fcfAPNsTokenReceived")
}
