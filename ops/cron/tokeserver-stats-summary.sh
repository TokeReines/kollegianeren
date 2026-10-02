#!/bin/sh
# Statistik's nightly summary (ops/stats-summary.js): from the local backup, after the backup has run
# (it works in the half hour before 09:00 Danish time). No reads; one write per kitchen.
#
#   55 8 * * * sh $HOME/bin/kollegianeren-stats-summary.sh >> $HOME/kollegianeren-backups/stats-summary.log 2>&1
set -e
KEY="$HOME/.config/kollegianeren/stats-sa.json"
OPS="$HOME/kollegianeren/ops"
OUT="$HOME/kollegianeren-backups"
[ -f "$KEY" ] || { echo "$(date -Is) no service account key at $KEY, skipping"; exit 0; }
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$OPS:/ops" -v "$OUT:/backups:ro" -v "$KEY:/key.json:ro" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/key.json -w /ops node:22-slim \
  sh -c "[ -d node_modules ] || npm install --silent --no-audit --no-fund; node stats-summary.js --project prod --from /backups/firebase-ehp $*"
