#!/bin/bash
# Run the CDP overlay browser check: start headless Chrome with remote
# debugging, then point scripts/overlay-browser-check.mjs at it.
set -u
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="${1:-http://localhost:5212/}"
DEBUG_PORT="${2:-9333}"
"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1280,800 --remote-debugging-port="$DEBUG_PORT" about:blank >/dev/null 2>&1 &
CPID=$!
sleep 1.5
node scripts/overlay-browser-check.mjs "http://127.0.0.1:$DEBUG_PORT"
RC=$?
kill $CPID 2>/dev/null
exit $RC
