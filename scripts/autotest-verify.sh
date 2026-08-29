#!/bin/bash
# Run the scripted autotest sweep in headless Chrome and extract QWVERIFY lines.
set -u
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="${1:-http://localhost:5211/?autotest=1}"
"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1280,800 \
  --virtual-time-budget=14000 \
  --enable-logging=stderr --log-level=0 \
  "$URL" 2>/tmp/qw-autotest.log
echo "chrome_exit=$?"
grep -o 'QWVERIFY {.*}' /tmp/qw-autotest.log | sed 's/^QWVERIFY //'
echo "--- console error/warning lines (filtered) ---"
grep -iE "console.*(error|warning)|uncaught" /tmp/qw-autotest.log \
  | grep -viE "gpu|dbus|fontconfig|GroupMarkerNotSet|swiftshader|Vulkan|fallback|CVDisplayLink|gcm|DEPRECATED" \
  | head -20
