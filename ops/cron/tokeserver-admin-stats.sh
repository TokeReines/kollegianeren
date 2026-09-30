#!/bin/sh
# Daily admin overview for the maker (prod): numbers per kitchen into adminStats/latest.
# Runs once a day from cron, just after the Spark quota resets (09:00 Danish time), about 700 reads.
# Uses its own service account (Firestore user, Firebase Auth viewer, Monitoring viewer), not the
# read-only backup account, because it writes that one document and reads when logins were used.
set -e
KEY="$HOME/.config/kollegianeren/stats-sa.json"
OPS="$HOME/kollegianeren/ops"
[ -f "$KEY" ] || { echo "$(date -Is) no service account key at $KEY, skipping"; exit 0; }
git -C "$HOME/kollegianeren" pull -q --ff-only || echo "$(date -Is) git pull failed, using current checkout"
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$OPS:/ops" -v "$KEY:/key.json:ro" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/key.json -w /ops node:22-slim \
  sh -c '[ -d node_modules ] || npm install --silent --no-audit --no-fund; node admin-stats.js --project prod'
