#!/bin/bash
# Autotest with REAL time (no virtual-time budget): chrome stays open for
# RUN_SECONDS, we screenshot at two moments, then kill.
set -u
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="${1:-http://localhost:5211/?autotest=1}"
RUN_SECONDS="${2:-10}"
LOG=/tmp/qw-autotest-real.log
SHOT_DIR=/tmp/qw-autotest-shots
mkdir -p "$SHOT_DIR"
rm -f "$LOG"

"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1280,800 \
  --enable-logging=stderr --log-level=0 \
  "$URL" > "$SHOT_DIR/stdout.txt" 2>"$LOG" &
CPID=$!
sleep 1
"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1280,800 --screenshot="$SHOT_DIR/mid.png" --virtual-time-budget=3000 "$URL" \
  > /dev/null 2>&1 &
sleep $((RUN_SECONDS - 1))
kill $CPID 2>/dev/null
wait $CPID 2>/dev/null
echo "--- QWVERIFY lines ---"
grep -o 'QWVERIFY {.*}' "$LOG" | sed 's/^QWVERIFY //'
echo "--- console errors (filtered) ---"
grep -iE "console.*(error|warning)|uncaught" "$LOG" \
  | grep -viE "gpu|dbus|fontconfig|GroupMarkerNotSet|swiftshader|Vulkan|fallback|CVDisplayLink|gcm|DEPRECATED" \
  | head -20
