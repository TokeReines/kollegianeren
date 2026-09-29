#!/bin/sh
# Nightly Kollegianeren Firestore backup (prod, read-only). Runs hourly from cron;
# backup.js --before-reset only does work in the 30 minutes before the Spark quota resets.
set -e
KEY="$HOME/.config/kollegianeren/backup-sa.json"
OPS="$HOME/kollegianeren/ops"
OUT="$HOME/kollegianeren-backups"
[ -f "$KEY" ] || { echo "$(date -Is) no service account key at $KEY, skipping"; exit 0; }
git -C "$HOME/kollegianeren" pull -q --ff-only || echo "$(date -Is) git pull failed, using current checkout"
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$OPS:/ops" -v "$OUT:/backups" -v "$KEY:/key.json:ro" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/key.json -w /ops node:22-slim \
  sh -c '[ -d node_modules ] || npm install --silent --no-audit --no-fund; node backup.js --project prod --out /backups/firebase-ehp --before-reset 30 --max-reads 25000 --ceiling 46000'
