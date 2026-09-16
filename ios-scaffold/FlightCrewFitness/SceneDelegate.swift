import UIKit
import UserNotifications // connectionOptions.notificationResponse is a UNNotificationResponse

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = ViewController()
        window?.makeKeyAndVisible()

        // BUG FIX (independent review finding, confirmed real): a
        // notification tapped while the app was NOT already running
        // delivers its payload here, via connectionOptions.notificationResponse
        // — AppDelegate's own userNotificationCenter(_:didReceive:) only
        // fires for a tap while the app is already in memory. Without this,
        // a cold-start notification tap silently did nothing: the app
        // launched to the default screen with the deep link dropped on the
        // floor. Posted after rootViewController is set (which runs
        // ViewController's viewDidLoad synchronously, registering its
        // .fcfPushNotificationTapped observer via observePushTaps()) so
        // this is never posted before anything is listening for it.
        if let response = connectionOptions.notificationResponse {
            NotificationCenter.default.post(
                name: .fcfPushNotificationTapped,
                object: nil,
                userInfo: response.notification.request.content.userInfo
            )
        }
    }
}
