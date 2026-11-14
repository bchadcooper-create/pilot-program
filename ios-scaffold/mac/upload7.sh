#!/bin/bash
# Run on the cloud Mac: sh ios-scaffold/mac/upload7.sh   (from ~/Desktop/pilot-program)
#
# Sends the archive made by archive7.sh to App Store Connect. That makes the
# build available in TestFlight after Apple finishes processing it. It does
# NOT submit anything for review and does not change the live app.
ARCH="$HOME/Desktop/FCF-1.1-7.xcarchive"
OUT="$HOME/Desktop/FCF-1.1-7-export"
OPT="$HOME/Desktop/FCF-ExportOptions.plist"
LOG="$HOME/Desktop/upload7.log"
clear
[ -d "$ARCH" ] || { echo "no archive at Desktop/FCF-1.1-7.xcarchive; run archive7.sh first"; exit 1; }
cat > "$OPT" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>3772GZ4MD5</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST
rm -rf "$OUT"
echo "uploading version 1.1 build 7 to App Store Connect (several minutes)..."
xcodebuild -exportArchive -archivePath "$ARCH" -exportOptionsPlist "$OPT" -exportPath "$OUT" -allowProvisioningUpdates > "$LOG" 2>&1
echo "== result: $(grep -E 'EXPORT (SUCCEEDED|FAILED)|Upload succeeded|Uploaded' "$LOG" | tail -2 | tr '\n' ' ')"
echo "== errors ($(grep -ci 'error' "$LOG")):"
grep -i 'error' "$LOG" | sort -u | cut -c1-300 | head -14
echo "== last lines of the log:"
tail -6 "$LOG" | cut -c1-240
echo "full log: Desktop/upload7.log"
