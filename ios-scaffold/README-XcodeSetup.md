# FCF iOS — Xcode Setup Guide
*For your cloud Mac session. Follow in order.*

---

## Files in this folder

| File | Purpose |
|------|---------|
| `FlightCrewFitness/AppDelegate.swift` | App entry point, push notification registration |
| `FlightCrewFitness/SceneDelegate.swift` | Window setup |
| `FlightCrewFitness/ViewController.swift` | WKWebView wrapper + StoreKit 2 + Sign In with Apple |
| `FlightCrewFitness/Info.plist` | All permission strings |
| `FlightCrewFitness/FlightCrewFitness.entitlements` | All 7 capabilities |
| `FCF-WebBridge.js` | Paste into your web app for the JS ↔ native bridge |

---

## Step 1 — Create a new Xcode project

1. Open Xcode → **File → New → Project**
2. Choose **iOS → App**
3. Fill in:
   - **Product Name:** `FlightCrewFitness`
   - **Bundle Identifier:** `fit.flightcrew.app`
   - **Team:** select your Apple Developer account (3772GZ4MD5)
   - **Interface:** Storyboard
   - **Language:** Swift
4. Uncheck "Include Tests" (add later if needed)
5. Save to your desired location

---

## Step 2 — Replace generated files

Delete everything Xcode created inside the `FlightCrewFitness/` group **except**:
- `Main.storyboard`
- `LaunchScreen.storyboard`
- `Assets.xcassets`

Then drag in (or paste content from) these files:
- `AppDelegate.swift`
- `SceneDelegate.swift`
- `ViewController.swift`
- `Info.plist` ← Xcode creates one; **replace its contents** with the provided file
- `FlightCrewFitness.entitlements` ← drag in; Xcode will detect it

---

## Step 3 — Storyboard wiring

Open `Main.storyboard`:
1. Click the single View Controller scene
2. In the Identity Inspector (right panel), set **Class** to `ViewController`
3. Delete the default white view — the WKWebView is added in code, nothing needed here

---

## Step 4 — Entitlements

1. Click your project (blue icon) in the navigator
2. Select the **FlightCrewFitness target**
3. Go to **Signing & Capabilities**
4. Set Team to your account
5. Make sure these capabilities are listed (they should match what's in App ID):
   - HealthKit
   - In-App Purchase
   - Push Notifications
   - Sign In with Apple
   - Time Sensitive Notifications
   - Sustained Execution (add via + Capability if missing)
6. Under **Signing**, confirm Xcode auto-selects the Distribution provisioning profile you created

---

## Step 5 — Build settings

In Build Settings:
- **iOS Deployment Target:** 16.0
- **Swift Language Version:** Swift 5
- **Enable Bitcode:** No (deprecated)

---

## Step 6 — Add app icon

In `Assets.xcassets`, replace the `AppIcon` placeholder with your FCF icon.
The icon must be 1024×1024 PNG (no alpha channel) for App Store submission.

---

## Step 7 — Archive & upload

1. Connect to a real device **or** select "Any iOS Device (arm64)" as destination
2. **Product → Archive**
3. When Archive Organizer opens, click **Distribute App**
4. Choose **App Store Connect → Upload**
5. Follow the prompts — Xcode will sign with your distribution cert and upload

---

## Web app integration (FCF-WebBridge.js)

Add the bridge script to your web app so JS can call native IAP and Sign In with Apple:

```html
<script src="/FCF-WebBridge.js"></script>
```

Then in your auth/payment JS:

```js
// Check if running in native app
if (FCFBridge.isNative) {
  // Show native Sign In with Apple button
  document.getElementById('siwa-btn').style.display = 'block';

  // Listen for SIWA result
  window.addEventListener('fcf:siwa:success', e => {
    const { identityToken, email, givenName } = e.detail;
    // Send identityToken to Supabase for verification
    supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken });
  });
}

// IAP — load products on your pricing page
FCFBridge.getProducts();
window.addEventListener('fcf:products', e => {
  const { products } = e.detail;
  // Render product cards with native prices
});

// Trigger purchase
FCFBridge.purchase('fit.flightcrew.app.pro.monthly');
window.addEventListener('fcf:purchase', e => {
  if (e.detail.success) {
    // Unlock Pro in Supabase
  }
});
```

---

## Push notification token

The APNs token is logged in Xcode console and printed as:
```
APNs token: abc123...
```

In `AppDelegate.swift`, the `didRegisterForRemoteNotificationsWithDeviceToken` method is where you'll POST the token to your Supabase backend. Uncomment and fill in the TODO when your backend endpoint is ready.

---

## Capabilities checklist

| Capability | Entitlements key | Status |
|-----------|-----------------|--------|
| HealthKit | `com.apple.developer.healthkit` | ✅ in entitlements |
| HealthKit Estimate Recalibration | `com.apple.developer.healthkit.recalibrate-estimates` | ✅ |
| In-App Purchase | `com.apple.developer.in-app-payments` | ✅ |
| Push Notifications | `aps-environment: production` | ✅ |
| Sign In with Apple | `com.apple.developer.applesignin` | ✅ |
| Sustained Execution | `com.apple.developer.sustained-execution` | ✅ |
| Time Sensitive Notifications | `com.apple.developer.usernotifications.time-sensitive` | ✅ |
