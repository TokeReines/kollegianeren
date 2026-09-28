# ops

Operational scripts. Run from this folder after `npm install` (Node 20+).

| Project alias | Project id | Use |
|---|---|---|
| `prod` | `firebase-ehp` | Live, used daily by the kitchens |
| `dev` | `kollegianeren` | Everything is built and tested here first |

Credentials: set `GOOGLE_APPLICATION_CREDENTIALS` to a service account key (cron), or be logged in with `firebase login` (local).

## Backup

Prod is on the free Spark plan: 50k document reads per day, and when they run out the kitchens get errors until the quota resets at midnight US Pacific (09:00 Danish time). A full dump is ~450k reads, so `backup.js` works in slices:

```bash
node backup.js --project prod --max-reads 20000 --ceiling 30000
```

- `--max-reads`: most reads this run may spend.
- `--ceiling`: stop when the project's reads for the quota day (from Cloud Monitoring, plus our own) would pass this.
- Output (default `~/kollegianeren-backups/<project>`):
  - `snapshots/<date>/`: kitchen docs, `users`, `products` per kitchen (last 30 kept).
  - `purchases/<kitchen>/*.ndjson.gz`: append-only purchase chunks, newest first backfill plus incremental.
  - `state.json`: cursors and counts per kitchen.

Each run snapshots the small collections (~1k reads), pulls new purchases, then backfills older ones round-robin until a limit is hit. Once a kitchen is fully backfilled, a weekly `count()` flags drift from hard deletes.

**Cron.** Run just before the quota day ends, when the day's usage is known and the leftover reads would be lost anyway. The reset is 08:00 or 09:00 Danish time depending on DST, so cron fires at both and `--before-reset` skips the wrong one:

```cron
40 7,8 * * * cd ~/kollegianeren/ops && node backup.js --project prod --before-reset 30 --max-reads 40000 --ceiling 46000 >> ~/kollegianeren-backups/backup.log 2>&1
```

The cron service account needs only `roles/datastore.viewer` and `roles/monitoring.viewer` on `firebase-ehp`.
