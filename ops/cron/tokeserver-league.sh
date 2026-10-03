#!/bin/sh
# Kollegiet's referee (ops/league.js): settles ended battles and closed polls. Every 15 minutes
# from cron, with --daily at 08:20 UTC (standings, history achievements), off the quarter hours.
# The state file keeps how far it has got, so an idle run is 2 reads and the daily one reads
# only what happened since yesterday. Same service account as the admin overview, because it writes.
#
#   */15 * * * * ~/kollegianeren/ops/cron/tokeserver-league.sh >> ~/kollegianeren-backups/league.log 2>&1
#   20 8 * * *   ~/kollegianeren/ops/cron/tokeserver-league.sh --daily >> ~/kollegianeren-backups/league.log 2>&1
set -e
KEY="$HOME/.config/kollegianeren/stats-sa.json"
OPS="$HOME/kollegianeren/ops"
STATE="$HOME/kollegianeren-backups"
[ -f "$KEY" ] || { echo "$(date -Is) no service account key at $KEY, skipping"; exit 0; }
mkdir -p "$STATE"
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$OPS:/ops" -v "$KEY:/key.json:ro" -v "$STATE:/state" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/key.json -w /ops node:22-slim \
  sh -c "[ -d node_modules ] || npm install --silent --no-audit --no-fund; node league.js --project prod --state /state/league-prod.json $*"
