#!/bin/bash
# Run on the cloud Mac: sh ios-scaffold/mac/build7.sh   (from ~/Desktop/pilot-program)
#
# Brings the Xcode project on the Mac up to the repo's build 7 code and does a
# compile check. It does NOT sign, archive or upload anything.
#   1. Backs up the files it is about to replace (once; never overwrites a backup).
#   2. Copies the five changed files from the repo. The entitlements file is
#      left alone: Xcode manages it on the Mac and it has Mac-only content.
#   3. Sets the build number to 7 (version stays 1.0 until a new version is
#      created in App Store Connect; see the note printed at the end).
#   4. Compiles for a generic iPhone with code signing off, and prints errors.
PROJ="$HOME/Desktop/flightcrewfitness"
P="$PROJ/FlightCrewFitness"
R="$HOME/Desktop/pilot-program/ios-scaffold/FlightCrewFitness"
BK="$HOME/Desktop/flightcrewfitness-build6-backup"
FILES="AppDelegate.swift HealthKitManager.swift NotificationManager.swift ViewController.swift Info.plist"
PBX="$PROJ/FlightCrewFitness.xcodeproj/project.pbxproj"
LOG="$HOME/Desktop/build7.log"
clear
if [ ! -d "$BK" ]; then
  mkdir -p "$BK" && for f in $FILES; do cp "$P/$f" "$BK/$f"; done && cp "$PBX" "$BK/project.pbxproj"
  echo "1. backup made: Desktop/flightcrewfitness-build6-backup"
else echo "1. backup already exists, left as is"; fi
for f in $FILES; do cp "$R/$f" "$P/$f"; done
echo "2. copied: $FILES"
sed -i '' 's/CURRENT_PROJECT_VERSION = [0-9]*;/CURRENT_PROJECT_VERSION = 7;/g' "$PBX"
echo "3. build number now: $(grep -o 'CURRENT_PROJECT_VERSION = [0-9]*' "$PBX" | sort -u | tr '\n' ' ')"
echo "4. compiling (a few minutes)..."
xcodebuild -project "$PROJ/FlightCrewFitness.xcodeproj" -scheme FlightCrewFitness -configuration Debug \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build > "$LOG" 2>&1
echo "== result: $(grep -E 'BUILD (SUCCEEDED|FAILED)' "$LOG" | tail -1)"
echo "== errors ($(grep -c ' error: ' "$LOG")):"
grep ' error: ' "$LOG" | sed 's#.*/FlightCrewFitness/##' | sort -u | cut -c1-230 | head -40
echo "== warnings in our files ($(grep ' warning: ' "$LOG" | grep -c 'FlightCrewFitness/')):"
grep ' warning: ' "$LOG" | grep 'FlightCrewFitness/' | sed 's#.*/FlightCrewFitness/##' | sort -u | cut -c1-200 | head -12
echo "full log: Desktop/build7.log"
