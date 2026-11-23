#!/bin/sh
# The read alarm (ops/read-alarm.js): a note in the maker's inbox when the day's reads near the free
# plan's cap, or the last hour read far more than normal. Every half hour from cron; no reads, one
# write per warning. Same service account as the admin overview (it writes the note and reads Cloud
# Monitoring, counted on otto-511021: firebase-ehp has no billing, so Monitoring refuses it there).
# A push too, if ~/.config/kollegianeren/alarm-push-url holds a URL (read-alarm.js, ALARM_PUSH_URL).
#
#   */30 * * * * sh $HOME/bin/kollegianeren-read-alarm.sh >> $HOME/kollegianeren-backups/read-alarm.log 2>&1
set -e
KEY="$HOME/.config/kollegianeren/stats-sa.json"
OPS="$HOME/kollegianeren/ops"
STATE="$HOME/kollegianeren-backups"
[ -f "$KEY" ] || { echo "$(date -Is) no service account key at $KEY, skipping"; exit 0; }
PUSH_FILE="$HOME/.config/kollegianeren/alarm-push-url"
PUSH=""; [ -f "$PUSH_FILE" ] && PUSH="$(cat "$PUSH_FILE")"
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$OPS:/ops" -v "$KEY:/key.json:ro" -v "$STATE:/state" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/key.json -e QUOTA_PROJECT=otto-511021 -e ALARM_PUSH_URL="$PUSH" -w /ops node:22-slim \
  sh -c "[ -d node_modules ] || npm install --silent --no-audit --no-fund; node read-alarm.js --project prod --state /state/read-alarm.json $*"
