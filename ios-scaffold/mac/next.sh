#!/bin/bash
# Run on the cloud Mac from ~/Desktop/pilot-program:
#     git pull -q origin main; sh ios-scaffold/mac/next.sh 9 1.2
# (the build number, then the version if it changes: a version already
# live on the App Store takes no new builds, so after 1.1 went live the
# next upload is 1.2). One step for a follow-up build:
# copies the code from the repo into the Xcode project, sets the build
# number, makes the signed archive and opens it in Xcode's Organizer, ready
# for Distribute App > App Store Connect > Distribute. It does not upload.
# The entitlements file is never touched.
N="$1"
V="$2"
case "$N" in ''|*[!0-9]*) echo "give the build number, e.g. sh ios-scaffold/mac/next.sh 9 1.2"; exit 1;; esac
PROJ="$HOME/Desktop/flightcrewfitness"
P="$PROJ/FlightCrewFitness"
R="$HOME/Desktop/pilot-program/ios-scaffold/FlightCrewFitness"
PBX="$PROJ/FlightCrewFitness.xcodeproj/project.pbxproj"
ARCH="$HOME/Desktop/FCF-build-$N.xcarchive"
LOG="$HOME/Desktop/build-$N.log"
clear
for f in AppDelegate.swift CalendarManager.swift HealthKitManager.swift NotificationManager.swift PurchaseManager.swift SceneDelegate.swift ViewController.swift Info.plist; do
  cmp -s "$R/$f" "$P/$f" || { cp "$R/$f" "$P/$f"; echo "copied $f"; }
done
sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9]*;/CURRENT_PROJECT_VERSION = $N;/g" "$PBX"
[ -n "$V" ] && sed -i '' "s/MARKETING_VERSION = [0-9.]*;/MARKETING_VERSION = $V;/g" "$PBX"
# Permission sentences. The project file can carry its own copies
# (INFOPLIST_KEY_...), and those win over Info.plist, so they are set there.
# Build 9 adds location (route maps) and mentions routes in the Health one.
HEALTH='Flight Crew Fitness reads your activity, sleep, and health data from Apple Health to power your daily briefing and fitness trends. If you ask it to, it also reads your hearing test to compare against the FAA hearing standard, and the route of a run or walk to draw it on a map. These stay on your iPhone unless you choose to share a route with your crew.'
LOCATION='Flight Crew Fitness uses your location only while you time a run or walk, to draw your route. Routes stay on your iPhone unless you choose to share one with your crew.'
HEALTH="$HEALTH" perl -pi -e 's/(INFOPLIST_KEY_NSHealthShareUsageDescription = )"[^"]*";/$1"$ENV{HEALTH}";/' "$PBX"
LOCATION="$LOCATION" perl -pi -e 's/(INFOPLIST_KEY_NSLocationWhenInUseUsageDescription = )"[^"]*";/$1"$ENV{LOCATION}";/' "$PBX"
if grep -q 'INFOPLIST_KEY_NSHealthShareUsageDescription' "$PBX" && ! grep -q 'INFOPLIST_KEY_NSLocationWhenInUseUsageDescription' "$PBX"; then
  LOCATION="$LOCATION" perl -pi -e 's/^(\s*)(INFOPLIST_KEY_NSHealthShareUsageDescription = [^\n]*\n)/$1$2$1INFOPLIST_KEY_NSLocationWhenInUseUsageDescription = "$ENV{LOCATION}";\n/' "$PBX"
fi
echo "project: $(grep -o 'MARKETING_VERSION = [0-9.]*\|CURRENT_PROJECT_VERSION = [0-9]*' "$PBX" | sort -u | tr '\n' ' ')"
rm -rf "$ARCH"
echo "archiving (several minutes)..."
xcodebuild -project "$PROJ/FlightCrewFitness.xcodeproj" -scheme FlightCrewFitness -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCH" -allowProvisioningUpdates archive > "$LOG" 2>&1
echo "== result: $(grep -E 'ARCHIVE (SUCCEEDED|FAILED)' "$LOG" | tail -1)"
echo "== errors ($(grep -c 'error: ' "$LOG")):"
grep 'error: ' "$LOG" | sed 's#.*/FlightCrewFitness/##' | sort -u | cut -c1-260 | head -20
APP="$ARCH/Products/Applications/FlightCrewFitness.app"
if [ -d "$APP" ]; then
  echo "== archive: version $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist") build $(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist")"
  echo "== background modes: $(/usr/libexec/PlistBuddy -c 'Print :UIBackgroundModes' "$APP/Info.plist" 2>&1 | tr '\n' ' ')"
  echo "== location text: $(/usr/libexec/PlistBuddy -c 'Print :NSLocationWhenInUseUsageDescription' "$APP/Info.plist" 2>&1 | cut -c1-90)"
  echo "== health text: $(/usr/libexec/PlistBuddy -c 'Print :NSHealthShareUsageDescription' "$APP/Info.plist" 2>&1 | cut -c150-330)"
  open "$ARCH"
  echo "opened in Xcode Organizer: Distribute App > App Store Connect > Distribute"
fi
echo "full log: Desktop/build-$N.log"
