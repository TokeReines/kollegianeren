#!/bin/sh
# The read alarm (ops/read-alarm.js): a note in the maker's inbox when the day's reads near the free
# plan's cap. Every half hour from cron; no reads, one write per warning. Same service account as the
# admin overview (it writes the note and reads Cloud Monitoring).
#
#   */30 * * * * sh $HOME/bin/kollegianeren-read-alarm.sh >> $HOME/kollegianeren-backups/read-alarm.log 2>&1
set -e
KEY="$HOME/.config/kollegianeren/stats-sa.json"
OPS="$HOME/kollegianeren/ops"
STATE="$HOME/kollegianeren-backups"
[ -f "$KEY" ] || { echo "$(date -Is) no service account key at $KEY, skipping"; exit 0; }
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$OPS:/ops" -v "$KEY:/key.json:ro" -v "$STATE:/state" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/key.json -w /ops node:22-slim \
  sh -c "[ -d node_modules ] || npm install --silent --no-audit --no-fund; node read-alarm.js --project prod --state /state/read-alarm.json $*"
