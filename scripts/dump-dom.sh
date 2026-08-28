#!/bin/bash
# Dump the live DOM and label screen-positions to verify framing (Sun..Pluto in view).
set -u
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="${1:-http://localhost:5211/}"
"$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --virtual-time-budget=9000 --dump-dom "$URL" 2>/dev/null > /tmp/qw-dom.html
echo "labels_found=$(grep -c 'label-ko' /tmp/qw-dom.html)"
echo "canvas=$(grep -c '<canvas' /tmp/qw-dom.html)"
# CSS2DRenderer positions labels with translate3d — extract name+transform pairs
grep -o 'translate3d([-0-9.]*px, *[-0-9.]*px' /tmp/qw-dom.html | head -40
