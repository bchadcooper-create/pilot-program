#!/usr/bin/env bash
# Assembles the Capacitor web bundle from the files GitHub Pages already
# serves. Deliberately a copy rather than a repo restructure: flightcrew.fit
# serves from the repository root, and moving those files would break the PWA
# that every existing user is on.
set -e
rm -rf www && mkdir -p www
cp index.html app.js sw.js manifest.json privacy.html terms.html www/ 2>/dev/null || true
cp icon-*.png favicon.ico www/ 2>/dev/null || true
echo "www/ built:"; ls www/
