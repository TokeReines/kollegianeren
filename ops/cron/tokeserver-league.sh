#!/bin/sh
# Kollegiet's referee (ops/league.js): settles ended battles and closed polls. Every 15 minutes
# from cron; an idle run is 2 reads. Add --daily for the 08:15 UTC run (standings, history
# achievements). Same service account as the admin overview, because it writes.
#
#   */15 * * * * ~/kollegianeren/ops/cron/tokeserver-league.sh >> ~/kollegianeren-backups/league.log 2>&1
#   15 8 * * *   ~/kollegianeren/ops/cron/tokeserver-league.sh --daily >> ~/kollegianeren-backups/league.log 2>&1
set -e
KEY="$HOME/.config/kollegianeren/stats-sa.json"
OPS="$HOME/kollegianeren/ops"
[ -f "$KEY" ] || { echo "$(date -Is) no service account key at $KEY, skipping"; exit 0; }
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$OPS:/ops" -v "$KEY:/key.json:ro" \
  -e GOOGLE_APPLICATION_CREDENTIALS=/key.json -w /ops node:22-slim \
  sh -c "[ -d node_modules ] || npm install --silent --no-audit --no-fund; node league.js --project prod $*"
