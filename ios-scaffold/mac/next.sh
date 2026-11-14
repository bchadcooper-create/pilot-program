#!/bin/bash
# Run on the cloud Mac from ~/Desktop/pilot-program:
#     git pull -q origin main; sh ios-scaffold/mac/next.sh 8
# (the number is the new build number). One step for a follow-up build:
# copies the code from the repo into the Xcode project, sets the build
# number, makes the signed archive and opens it in Xcode's Organizer, ready
# for Distribute App > App Store Connect > Distribute. It does not upload.
# The version (1.1) is left as it is. The entitlements file is never touched.
N="$1"
case "$N" in ''|*[!0-9]*) echo "give the build number, e.g. sh ios-scaffold/mac/next.sh 8"; exit 1;; esac
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
  open "$ARCH"
  echo "opened in Xcode Organizer: Distribute App > App Store Connect > Distribute"
fi
echo "full log: Desktop/build-$N.log"
