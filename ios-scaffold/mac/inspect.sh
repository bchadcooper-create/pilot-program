#!/bin/bash
# Run on the cloud Mac: sh ios-scaffold/mac/inspect.sh   (from ~/Desktop/pilot-program)
# Read-only. Shows how the Xcode project on the Mac differs from the repo.
P="$HOME/Desktop/flightcrewfitness"
R="$HOME/Desktop/pilot-program/ios-scaffold/FlightCrewFitness"
clear
echo "== repo: $(cd "$R" && git log -1 --format='%h %s' | cut -c1-70)"
echo "== $(xcodebuild -version | tr '\n' ' ')"
echo "== files in the Xcode project folder:"; ls "$P/FlightCrewFitness" | tr '\n' ' '; echo
echo "== differences, repo vs project (Assets left out):"
diff -rq "$R" "$P/FlightCrewFitness" 2>&1 | grep -v xcassets | sed "s#$HOME/Desktop/##g" | cut -c1-150
echo "== version / build in the project file:"
grep -o "MARKETING_VERSION = [^;]*\|CURRENT_PROJECT_VERSION = [^;]*\|PRODUCT_BUNDLE_IDENTIFIER = [^;]*\|DEVELOPMENT_TEAM = [^;]*\|INFOPLIST_FILE = [^;]*\|IPHONEOS_DEPLOYMENT_TARGET = [^;]*" "$P/FlightCrewFitness.xcodeproj/project.pbxproj" | sort | uniq -c
echo "== Info.plist CFBundleVersion in project:"; /usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$P/FlightCrewFitness/Info.plist" 2>&1
echo "== swift files Xcode compiles:"; grep -o "[A-Za-z]*\.swift in Sources" "$P/FlightCrewFitness.xcodeproj/project.pbxproj" | sort -u | tr '\n' ' '; echo
echo "== schemes:"; xcodebuild -list -project "$P/FlightCrewFitness.xcodeproj" 2>/dev/null | sed -n '/Schemes/,$p' | tr '\n' ' '; echo
