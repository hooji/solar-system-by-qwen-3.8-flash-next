#!/bin/bash
# Verify the qw-solar demo renders without console errors (headless Chrome).
set -u
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [ ! -x "$CHROME" ]; then
  echo "chrome binary missing"
  exit 2
fi
URL="${1:-http://localhost:5211/}"
"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1280,800 \
  --screenshot=/tmp/qw-solar-shot.png \
  --virtual-time-budget=8000 \
  --enable-logging=stderr --log-level=0 \
  "$URL" 2>/tmp/qw-chrome-console.log
echo "chrome_exit=$?"
echo "--- console error/warning lines (filtered) ---"
grep -iE "console|uncaught|error" /tmp/qw-chrome-console.log \
  | grep -viE "gpu|dbus|fontconfig|GroupMarkerNotSet|swiftshader|Vulkan|fallback" \
  | head -30
echo "--- screenshot ---"
ls -la /tmp/qw-solar-shot.png
