#!/bin/bash
# Run on the cloud Mac: sh ios-scaffold/mac/archive7.sh   (from ~/Desktop/pilot-program)
#
# Makes the signed archive for version 1.1 build 7. Does NOT upload.
# Version 1.0 is live on the App Store, so Apple will not take another 1.0
# build; the next upload has to carry a higher version. 1.1 because this
# build adds features.
PROJ="$HOME/Desktop/flightcrewfitness"
PBX="$PROJ/FlightCrewFitness.xcodeproj/project.pbxproj"
ARCH="$HOME/Desktop/FCF-1.1-7.xcarchive"
LOG="$HOME/Desktop/archive7.log"
clear
sed -i '' 's/MARKETING_VERSION = [0-9.]*;/MARKETING_VERSION = 1.1;/g' "$PBX"
echo "1. project now: $(grep -o 'MARKETING_VERSION = [0-9.]*\|CURRENT_PROJECT_VERSION = [0-9]*' "$PBX" | sort -u | tr '\n' ' ')"
# The project file can carry its own copies of the Info.plist permission
# sentences (INFOPLIST_KEY_...), and those win over Info.plist. The first
# archive showed the Health sentence was coming from there, so it is updated
# in both places.
echo "== permission sentences set in the project file:"
grep -o 'INFOPLIST_KEY_NS[A-Za-z]* = [^;]*' "$PBX" | sort -u | cut -c1-150
HEALTH='Flight Crew Fitness reads your activity, sleep, and health data from Apple Health to power your daily briefing and fitness trends. If you ask it to, it also reads your hearing test to compare against the FAA hearing standard. That result stays on your iPhone.'
PHOTO='Flight Crew Fitness saves a workout summary picture to your photo library when you choose Save Image.'
HEALTH="$HEALTH" perl -pi -e 's/(INFOPLIST_KEY_NSHealthShareUsageDescription = )"[^"]*";/$1"$ENV{HEALTH}";/' "$PBX"
if grep -q 'INFOPLIST_KEY_NSHealthShareUsageDescription' "$PBX" && ! grep -q 'INFOPLIST_KEY_NSPhotoLibraryAddUsageDescription' "$PBX"; then
  PHOTO="$PHOTO" perl -pi -e 's/^(\s*)(INFOPLIST_KEY_NSHealthShareUsageDescription = [^\n]*\n)/$1$2$1INFOPLIST_KEY_NSPhotoLibraryAddUsageDescription = "$ENV{PHOTO}";\n/' "$PBX"
fi
rm -rf "$ARCH"
echo "2. archiving (several minutes)..."
xcodebuild -project "$PROJ/FlightCrewFitness.xcodeproj" -scheme FlightCrewFitness -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCH" -allowProvisioningUpdates archive > "$LOG" 2>&1
echo "== result: $(grep -E 'ARCHIVE (SUCCEEDED|FAILED)' "$LOG" | tail -1)"
echo "== errors ($(grep -c 'error: ' "$LOG")):"
grep 'error: ' "$LOG" | sed 's#.*/FlightCrewFitness/##' | sort -u | cut -c1-260 | head -20
APP="$ARCH/Products/Applications/FlightCrewFitness.app"
if [ -d "$APP" ]; then
  echo "== archive version: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Info.plist") build $(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Info.plist") id $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")"
  echo "== signed by: $(codesign -dvv "$APP" 2>&1 | grep -E 'Authority=|TeamIdentifier' | head -2 | tr '\n' ' ')"
  echo "== entitlements in the signed app:"
  codesign -d --entitlements :- "$APP" 2>/dev/null | grep -o '<key>[^<]*</key>' | tr '\n' ' '; echo
  echo "== health text: $(/usr/libexec/PlistBuddy -c 'Print :NSHealthShareUsageDescription' "$APP/Info.plist" | cut -c100-260)"
  echo "== photo text: $(/usr/libexec/PlistBuddy -c 'Print :NSPhotoLibraryAddUsageDescription' "$APP/Info.plist" 2>&1 | cut -c1-120)"
  echo "== app-bound domains: $(/usr/libexec/PlistBuddy -c 'Print :WKAppBoundDomains' "$APP/Info.plist" 2>&1 | tr '\n' ' ')"
fi
echo "full log: Desktop/archive7.log"
