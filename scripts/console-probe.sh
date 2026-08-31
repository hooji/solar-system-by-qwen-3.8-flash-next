#!/bin/bash
# Quick console-error probe for a dev URL (headless Chrome, real time).
set -u
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="${1:-http://localhost:5213/}"
LOG=/tmp/qw-console-probe.log
"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1280,800 --virtual-time-budget=4000 \
  --enable-logging=stderr --log-level=0 \
  "$URL" 2>"$LOG"
grep -iE "uncaught|TypeError|ReferenceError|console.*(error)" "$LOG" \
  | grep -viE "gpu|dbus|fontconfig|GroupMarkerNotSet|swiftshader|Vulkan|fallback|CVDisplayLink|gcm|DEPRECATED" \
  | head -10
echo "--- probe done (exit $?) ---"
