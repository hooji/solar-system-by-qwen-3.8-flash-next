#!/bin/bash
# Capture one headless-Chrome screenshot of a URL (verification helper).
# Usage: scripts/screenshot.sh URL OUT_PNG [BUDGET_MS]
set -u
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="${1:-http://localhost:5211/}"
OUT="${2:-/tmp/qw-shot.png}"
BUDGET="${3:-14000}"
"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --window-size=1280,800 --virtual-time-budget="$BUDGET" \
  --screenshot="$OUT" "$URL" >/dev/null 2>&1
echo "shot_exit=$? out=$OUT"
ls -la "$OUT" 2>/dev/null || ls -la "$OUT"
