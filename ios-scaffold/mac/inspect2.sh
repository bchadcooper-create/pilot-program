#!/bin/bash
# Run on the cloud Mac: sh ios-scaffold/mac/inspect2.sh   (from ~/Desktop/pilot-program)
# Read-only. For each file that differs, says whether the Mac's copy is an
# older version from the repo (safe to replace) or has edits made only on
# the Mac (must be looked at before replacing).
P="$HOME/Desktop/flightcrewfitness/FlightCrewFitness"
S="ios-scaffold/FlightCrewFitness"
cd "$HOME/Desktop/pilot-program" || exit 1
clear
for f in AppDelegate.swift HealthKitManager.swift NotificationManager.swift ViewController.swift CalendarManager.swift PurchaseManager.swift SceneDelegate.swift Info.plist FlightCrewFitness.entitlements; do
  if cmp -s "$S/$f" "$P/$f"; then echo "$f: same as repo now"; continue; fi
  found=""
  for c in $(git log --format=%h -- "$S/$f"); do
    if git show "$c:$S/$f" 2>/dev/null | cmp -s - "$P/$f"; then found="$c $(git log -1 --format=%cs "$c")"; break; fi
  done
  if [ -n "$found" ]; then echo "$f: Mac copy = repo commit $found (no Mac-only edits)"; else echo "$f: MAC-ONLY EDITS (matches no repo version)"; fi
done
echo "== Info.plist: repo (<) vs Mac (>)"
diff "$S/Info.plist" "$P/Info.plist" | cut -c1-170 | head -30
echo "== entitlements: repo (<) vs Mac (>)"
diff "$S/FlightCrewFitness.entitlements" "$P/FlightCrewFitness.entitlements" | cut -c1-170 | head -24
