# ops

Operational scripts. Run from this folder after `npm install` (Node 20+).

| Project alias | Project id | Use |
|---|---|---|
| `prod` | `firebase-ehp` | Live, used daily by the kitchens |
| `dev` | `kollegianeren` | Everything is built and tested here first |

Credentials: set `GOOGLE_APPLICATION_CREDENTIALS` to a service account key (cron), or be logged in with `firebase login` (local).

## Backup

Prod is on the free Spark plan: 50k document reads per day, and when they run out the kitchens get errors until the quota resets at midnight US Pacific (09:00 Danish time). The backups are for invoicing, which looks back a quarter or so, so they keep **the last 12 months of purchases** and cost as little as possible:

```bash
node backup.js --project prod --max-reads 8000 --backfill-reads 5000 --keep-days 365
```

- `--max-reads`: most reads this run may spend (default 8000).
- `--backfill-reads`: of those, most spent on catching up on older purchases (default 5000). Only needed until the year is filled in; after that a night costs about 1.5k reads.
- `--keep-days`: the window (default 365). Older purchases are never read, and dropped from the backup once they fall out of it.
- `--ceiling`: stop when the project's reads for the quota day (from Cloud Monitoring, plus our own) would pass this. Only works with a personal login (see below).
- Output (default `~/kollegianeren-backups/<project>`):
  - `snapshots/<date>/`: kitchen docs, `users`, `products` per kitchen (last 30 kept).
  - `purchases/<kitchen>/*.ndjson.gz`: purchase chunks, newest first backfill plus incremental.
  - `state.json`: cursors and counts per kitchen.

Each run snapshots the small collections (~1k reads), pulls new purchases, backfills older ones within the window round-robin until a limit is hit, then prunes what fell out of the window. Once a kitchen is fully backfilled, a weekly `count()` of the window flags drift from hard deletes.

Do not run big backups by hand on top of cron: the quota is shared with the kitchens.

**Cron.** Run just before the quota day ends, when the day's usage is known and the leftover reads would be lost anyway. The reset is 08:00 or 09:00 Danish time depending on DST, so cron fires at both and `--before-reset` skips the wrong one:

```cron
40 7,8 * * * cd ~/kollegianeren/ops && node backup.js --project prod --before-reset 30 --max-reads 8000 --backfill-reads 5000 --ceiling 46000 >> ~/kollegianeren-backups/backup.log 2>&1
```

## Restore

`restore.js` takes the latest snapshot plus every purchase chunk (later copies win) and writes them with BulkWriter. Kitchens and small collections go first, so a capped restore still gives usable kitchens.

**Local development data** (anonymised, no quota, never touches a real project):

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 firebase emulators:exec --only firestore --project demo-kollegianeren \
  --export-on-exit ~/kollegianeren-emulator-data \
  "node restore.js --from ~/kollegianeren-backups/firebase-ehp --project demo-kollegianeren --anonymise"
```

Later: `firebase emulators:start --only firestore --project demo-kollegianeren --import ~/kollegianeren-emulator-data`.

`--anonymise` replaces resident names, rooms and photos with stable fakes (`Beboer 12`, room `112`), also on the purchases that copy them.

**Into the dev project**: dev has a 20k writes/day quota, so pick kitchens and cap writes: `--kitchens <id> --rename-kitchen <prodId>=<yourDevUid> --max-writes 15000 --anonymise`.

**Emergency restore into prod**: needs `--i-really-mean-prod` and refuses `--anonymise`. Mind the 20k writes/day cap: restore one kitchen at a time with `--kitchens`.

## Credentials for cron

The cron service account needs only `roles/datastore.viewer` and `roles/monitoring.viewer` on `firebase-ehp`.

## Tokeserver (current setup)

`cron/tokeserver-backup.sh` runs hourly from cron on tokeserver in a `node:22-slim` container; `--before-reset` makes it work only in the last 30 minutes of the quota day. It needs a key for a read-only service account at `~/.config/kollegianeren/backup-sa.json` and skips until that exists. Log: `~/kollegianeren-backups/backup.log`.

## Rules

- `node deploy-rules.js prod ../firestore.rules [--dry]` publishes rules through the Firebase Rules API. The CLI's `firebase deploy --only firestore:rules` needs the Service Usage API, which is disabled on prod. `--dry` prints the live rules and compiles the new ones server-side.
- `node deploy-rules.js prod projects/firebase-ehp/rulesets/<id> [--dry]` rolls back to an earlier ruleset.
- `node rules-evaluations.js [sinceISO]` shows ALLOW / DENY / ERROR counts, to confirm a rules change does not block the kitchens.
- Prod rules before the lockdown (2026-09-29): ruleset `575c2f72-ae7b-49a8-8a96-a1d157473644`.

With a service account, Cloud Monitoring refuses reads on a Spark project ("requires billing"), so on tokeserver the ceiling check is skipped and `--max-reads 8000` is the only limit. The run happens in the last 30 minutes before the reset, when kitchens are quiet.

## Hosting rollback

`node make-rollback.js --project prod --version <id> --out ~/kollegianeren-rollback` downloads a live hosting version and adds a safety service worker, for going back to a build without one (the 2019 build). Deploy with `firebase deploy --only hosting --project prod` from the output folder. Why and when: `docs/prod-release.md`.

## Local demo data

On top of the anonymised prod copy (`restore.js --anonymise` into the emulator):

- `node seed-emulator.js`: the maker login and the launch post.
- `node seed-demo.js`: extra logins with roles, invites, stock, moved-out residents, a week of purchases, maker threads, a small referred kitchen.
- `node seed-avatars.js`: illustrated avatars (DiceBear Notionists, CC0, generated locally) for every other resident.

Logins are listed in `~/kollegianeren-emulator-data/accounts.json`.

- `node seed-test-kitchen.js --project dev --catalogue <file>`: a test kitchen on dev (products with pictures, 23 residents, two weeks of purchases) and two 14-day invite links, owner and tablet. The tester registers with their own email and password. Refuses prod.

## Removing kitchens and logins

 archives each kitchen (doc, subcollections and anything that points at it) to , then deletes it with its legacy owner login. Refuses kitchens with purchases unless ; a dry run without . Used on 2026-09-30 for five empty kitchens and five logins from 2016 that were never used (#66).
