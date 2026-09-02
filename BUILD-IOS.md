# Building and submitting the iOS app

Written to be followed top to bottom on a metered cloud Mac. Everything that
could be prepared in advance already has been; what remains genuinely needs
Xcode.

**Before you start the clock**, have these ready:
- Apple Developer account approved
- App Store Connect: Agreements, Tax and Banking complete
- Bundle ID decided: `fit.flightcrew.app` (already in `capacitor.config.json`)

---

## 1. Environment (once, ~20 min)

MacinCloud images ship Xcode but not always Node. CocoaPods is preinstalled.

```bash
# Node via NVM — works without admin, per MacinCloud support
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install --lts

node -v          # expect v20+
pod --version    # preinstalled
xcodebuild -version   # MUST be Xcode 26.x — anything lower cannot submit
```

If `xcodebuild` reports below 26, stop and ask MacinCloud support to move you
to a macOS Tahoe image. Apple has rejected all uploads built with older Xcode
since 28 April 2026, so continuing wastes the rest of the session.

## 2. Clone and scaffold (~10 min)

```bash
git clone https://github.com/bchadcooper-create/pilot-program.git
cd pilot-program

npm install
./build-www.sh          # assembles www/ from the PWA files
npx cap add ios
npx cap sync ios
```

## 3. Add the native plugins (~5 min)

```bash
cp native/ios/FCFPurchasesPlugin.swift native/ios/FCFPurchasesPlugin.m ios/App/App/
cp native/ios/FCFHealthPlugin.swift   native/ios/FCFHealthPlugin.m   ios/App/App/
npx cap open ios
```

In Xcode, drag the four files into the **App** target if they don't appear.
The `.m` files matter: Capacitor discovers plugins through the Objective-C
runtime, and without them the plugin compiles but is undefined from JavaScript.

## 4. Xcode configuration (~20 min)

**Signing & Capabilities** → select your team. Bundle ID `fit.flightcrew.app`.

Add capabilities:
- **In-App Purchase**
- **HealthKit**

**Info.plist** — add these. HealthKit strings are mandatory; the app crashes
on launch without them, and Apple rejects a build that asks without explaining:

| Key | Value |
|---|---|
| `NSHealthShareUsageDescription` | Flight Crew Fitness reads your weight and sleep data to tailor training and recovery guidance. |
| `NSHealthUpdateUsageDescription` | Flight Crew Fitness saves completed workouts to Apple Health so they count toward your activity rings. |
| `NSCameraUsageDescription` | Used to photograph meals for nutrition analysis. |
| `NSPhotoLibraryUsageDescription` | Used to select meal photos for nutrition analysis. |

## 5. App Store Connect (~30 min)

Create the app record, then under **Subscriptions** create a group and two
products. **The IDs must match exactly** — they are hardcoded in `app.js`:

- `fcf_pro_annual` — $59.99/year
- `fcf_pro_monthly` — $7.99/month

Then **App Information → App Store Server Notifications**, version 2, both
Production and Sandbox URLs set to:
`https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-appstore-notifications`

## 6. Build and upload (~20 min)

Set a real version and build number, then:

**Product → Destination → Any iOS Device**, then **Product → Archive** →
**Distribute App** → **App Store Connect** → **Upload**.

Archive is greyed out if the destination is a simulator. That catches everyone
once.

## 7. Before submitting for review

- **TestFlight first.** Install on the iPad Air and actually complete a
  sandbox purchase — a broken purchase flow is a guaranteed rejection.
- **Verify account deletion works** on a throwaway account. Its absence is an
  automatic rejection and reviewers do check.
- **Privacy nutrition label** — declare: Health & Fitness, Contact Info
  (email), User Content (photos), Identifiers. Nothing is used for tracking,
  so answer "No" to tracking throughout.
- **Reviewer notes** — give them a working demo account. A reviewer who can't
  sign in rejects on that alone.

## The rejection risk to take seriously

Guideline 4.2 targets apps that are "not sufficiently different from a mobile
web browsing experience." A Capacitor wrapper is exactly the shape Apple
scrutinises. HealthKit is the strongest counter-argument, which is why it is
built before submission rather than after a rejection.

If rejected under 4.2, the answer is more native surface — a Live Activity
rest timer in the Dynamic Island and a home screen widget are the next two,
and both are impossible on the web.

Say the word and I'll write those before you resubmit.
