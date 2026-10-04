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
- `node seed-kollegiet.js`: Kollegiet (docs/kollegiet.md): a test case for every feature around Ny2: a message from Toke, profiles, product categories, posts, events, a live beer battle, a challenge, kudos and polls. Then `node league.js --emulator --daily` settles the ended battle and the closed poll.
- `node seed-kollegiet.js --project dev --kitchen <id>`: the same on dev around one kitchen, against four test kitchens (`test-rival-1` to `4`, "Test Ny2" and so on) with their own products, residents and purchases. Nothing is written to the home kitchen's purchases or residents. `--remove` takes it all out again. Refuses prod.

Logins are listed in `~/kollegianeren-emulator-data/accounts.json`.

- `node seed-test-kitchen.js --project dev --catalogue <file>`: a test kitchen on dev (products with pictures, 23 residents, two weeks of purchases) and two 14-day invite links, owner and tablet. The tester registers with their own email and password. Refuses prod.

## Kollegiet

Live battle tallies are moved by the kitchens' own tablets; these settle and check (docs/kollegiet.md).

- `node league.js --project dev [--daily] [--dry] [--state <file>]`: settles battles that ended (recomputed from the real purchases, meals and taps; a tally that is off is reported to the maker's inbox, a live achievement it does not reach is taken back) and polls that closed (the secret ballots counted). Results are pinned on the board by the app, not posted. `--daily` also writes standings and the achievements that need history. With `--state` it keeps how far it has got: an idle run is 2 reads and the daily one about 30. Without, it looks through the last two weeks and counts everything again. A result is claimed with a precondition, so two runs at once never settle the same battle twice. `--max-reads` (6000) caps the recounting per run. `--emulator --loop 60` runs it locally every minute.
- `cron/tokeserver-league.sh`: the same on prod with `--state ~/kollegianeren-backups/league-prod.json`, every 15 minutes, with `--daily` at 08:20 UTC. Not scheduled yet.
- `node suggest-categories.js --project dev [--write]`: proposes beer, soda, water and so on from product names, for products without a category. Writing to prod needs `--i-really-mean-prod`.

## Removing kitchens and logins

`node remove-kitchens.js --project prod --kitchens <ids> [--logins <uids>] [--confirm]` archives each kitchen (doc, subcollections and anything that points at it) to `~/kollegianeren-archive/<project>/`, then deletes it with its legacy owner login. Refuses kitchens with purchases unless `--allow-purchases`; without `--confirm` it is a dry run. Used on 2026-09-30 for five empty kitchens and five logins from 2016 that were never used (#66).

## Auth settings

node auth-config.js --project dev shows email enumeration protection, the authorised domains and the sign-in methods; --email-privacy on|off and --domains a,b change them (Identity Toolkit admin API, works on prod too).

## API keys

node api-key.js --project dev|prod shows which websites may use the browser API key; --referrers a,b sets them and --referrers any undoes it. Since 2026-09-30: dev allows kollegianeren.web.app, kollegianeren.firebaseapp.com and localhost; prod allows ehp.web.app, ehp.firebaseapp.com and the release preview channel. The calls are billed to dev, where the API Keys API is on (#63).

## Admin overview

`node admin-stats.js --project dev|prod [--dry]` counts how each kitchen uses the app (purchases today, 7 and 30 days, residents as counts, the product list, food club, messages, logins and when they were last used, old or new app) and writes it to `adminStats/latest`, which only admins can read: the Admin page in the app. No resident names and nothing per resident, as the privacy page promises. Counts are aggregation queries, so a run on prod is about 700 reads.

`cron/tokeserver-admin-stats.sh` runs it once a day on tokeserver at 08:10 UTC, just after the quota resets (tokeserver runs on UTC). It uses the `toke-server` service account, key at `~/.config/kollegianeren/stats-sa.json` (roles `datastore.user`, `firebaseauth.viewer`, `monitoring.viewer`), because it writes that one document; the backup account stays read-only. It skips while the key is missing. Log: `~/kollegianeren-backups/admin-stats.log`.

Cloud Monitoring refuses service accounts on a project without billing, so cron runs leave the reads-per-day chart empty (the page hides it), as the backup's quota check already notes in its log. A run with your own `firebase login` fills it.

## Read budget: the summaries for Statistik and Regnskab, and the read alarm

- **`stats-summary.js`** (cron `cron/tokeserver-stats-summary.sh`, 08:55 Danish time, after the
  backup): from the local backup, one summary per kitchen of the last 92 days per Danish day, in
  `kitchens/{kid}/summaries/stats`. Statistik reads it (1 read) and only the purchases since it,
  instead of every purchase in the period (thousands of reads per visit). A summary only covers a
  kitchen from where its backup is complete; for longer periods the page reads as before.
  The same job writes Regnskab's summary: one document per kitchen and month,
  `kitchens/{kid}/summaries/accounts-YYYY-MM`, per day, resident and product (`lib/accounts-summary.js`).
  Regnskab reads the months of the period (1 read each), the purchases after the summary live, and
  the purchases taken back since: the app writes a note in `kitchens/{kid}/removed/` with every
  delete (the rules require it), and the backup keeps their ids, so the next summary leaves them
  out. It also writes `adminStats/nightly`, which the Admin page shows, red after two days.
  No reads; about 15 writes per kitchen.
- **Checking Regnskab's summary**: `node tools/accounts-check/run.js --project dev --from 2026-09-01 --to 2026-10-04`
  computes every kitchen's Regnskab both ways with the app's code and compares them to the øre.
  A read per purchase in the period.
- **A missed night** (the day's quota already used up when the backup runs): the next hourly run
  finds the last good backup more than 25 hours old and runs anyway, right after the reset.
- **`read-alarm.js`** (cron `cron/tokeserver-read-alarm.sh`, every 30 minutes): a note in the
  maker's inbox (🚩). With a person's own login (Cloud Monitoring works): the first time a day
  passes 35,000 and 45,000 reads. On tokeserver, whose service account Monitoring refuses on the
  Spark plan ("requires billing"): one read as a probe, and a note as soon as the quota is used up.
  One write per warning. State in `~/kollegianeren-backups/read-alarm.json`.
- On 1 October the day passed the cap (62,943 reads): Statistik and Regnskab opened often, and
  three releases that reloaded every tablet. Release at most once a day, in the morning.
