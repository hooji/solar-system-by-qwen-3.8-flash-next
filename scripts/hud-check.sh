#!/bin/bash
# Check the sim-clock / speed / transport HUD text in the live DOM (spec §8).
set -u
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="${1:-http://localhost:5211/}"
"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --virtual-time-budget=6000 --dump-dom "$URL" 2>/dev/null > /tmp/qw-hud-dom.html
echo "sim-clock lines:"
grep -oE 'sim-clock"[^<]*<?' /tmp/qw-hud-dom.html | head -3
echo "sim-speed lines:"
grep -oE 'sim-speed"[^<]*' /tmp/qw-hud-dom.html | head -3
echo "aria-pressed:"
grep -oE 'aria-pressed="[a-z]+"' /tmp/qw-hud-dom.html | head -4
