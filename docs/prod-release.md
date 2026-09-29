# Prod release: the 2026 rebuild

Runbook for replacing the 2019 build on prod (`firebase-ehp`, https://ehp.web.app) with `develop`. Commands run in WSL from `~/kollegianeren` unless they say `ops/`. About an hour, most of it watching.

## What changes

| | Now | After |
|---|---|---|
| Hosting (site `ehp`) | version `7f5f4b4295f2aaad`, `master` from 2019-01-06 (tag `live-2019-01-06`) | `develop` built with `-c production` |
| Firestore rules | ruleset `00794461-cee0-43b4-a6c8-c070916efb56` (owner-only lockdown, 2026-09-29) | `firestore.rules` (roles, invites, validated purchases) |
| Data | no `sold` on products | `sold` set once from the backups (buy page order) |

Nothing else moves: no data migration, no new indexes, no billing. Anonymous sign-in (resident links) and the maker's `admins/` doc are already set up on prod.

## Checked beforehand (2026-09-29)

- **The 2019 build works on the new rules.** It writes purchases with `serverTimestamp()` and exactly the fields `validPurchase` allows, and legacy kitchens (`kid == uid`) are owners. Every purchase shape in the backups passes (`rules-test`). Tablets that have not reloaded keep working.
- **Logins survive the upgrade.** A session saved by Firebase 5.7 (the 2019 build) is picked up by Firebase 12.19 on the same origin: tested on dev. Kitchens do not need their passwords.
- **No composite indexes needed.** Every query the app makes ran on prod with the admin SDK.
- **The CLI can deploy hosting to prod** (`--dry-run` passes). Rules go through `ops/deploy-rules.js`, because the CLI needs the Service Usage API, which is off on prod.
- **Rollback drill on dev.** With the new app and its service worker in a browser, deploying the rollback bundle brought the page back to the 2019 build by itself within about 15 seconds; restoring worked too.
- `ops/backfill-sold.js --dry-run`: 204 products in 12 kitchens, 0 reads (from the backups).

## When

After 09:00 Danish time (the Spark read quota resets then) and before the evening rush (kitchens buy mostly 16 to 23). Late morning is best: a fresh backup ran at 08:40 on tokeserver, the full day's quota is left, and there is time to watch.

## 0. Preflight (10 min, read-only)

```bash
git checkout develop && git pull --ff-only && npm ci
npm run lint && npm test
node ops/usage.js --project prod --days 3                         # today's reads should be low
ssh toke@192.168.40.10 'grep -v skipping ~/kollegianeren-backups/backup.log | tail -5'   # this morning's backup ran
cd ops && node deploy-rules.js prod ../firestore.rules --dry | head -3 && cd ..         # live ruleset still 00794461…, new one compiles
```

Build the rollback bundle **now, while the 2019 build is still live** (it downloads the live files):

```bash
cd ops && node make-rollback.js --project prod --version 7f5f4b4295f2aaad --out ~/kollegianeren-rollback && cd ..
```

It should list 16 files (index.html, main.8932ac….js, …) and write a safety `ngsw-worker.js`.

## 1. Rules (5 min, then 15 min watching)

```bash
cd ops && node deploy-rules.js prod ../firestore.rules && cd ..
```

Note the time, wait 15 minutes, then:

```bash
node ops/rules-evaluations.js <time of release, ISO>
```

DENY and ERROR should stay close to zero; a kitchen buying on the old build shows up as ALLOW. If denies climb, roll the rules back (below) and stop.

## 2. Build and try it on a preview channel (15 min)

```bash
npm run build:prod
firebase hosting:channel:deploy release --project prod --expires 3d
```

This serves the new build on prod data at a temporary URL (`https://ehp--release-….web.app`) without touching the live site. If the CLI warns that it could not add the channel to the authorised domains, carry on: email and password logins do not need it. There:

- Log in with the maker login: Aktuelt and the inbox load, no errors in the console.
- If a kitchen login is at hand: buy, check Seneste køb and take one back, open Regnskab and export CSV.

## 3. Go live (1 min)

```bash
firebase hosting:clone ehp:release ehp:live --project prod
```

This promotes the exact build that was just tried. (Same result: `firebase deploy --only hosting --project prod`.)

## 4. Sold counters (2 min)

```bash
cd ops
node backfill-sold.js --project prod --from ~/kollegianeren-backups/firebase-ehp --dry-run
node backfill-sold.js --project prod --from ~/kollegianeren-backups/firebase-ehp
cd ..
```

About 204 writes, no reads. Only the buy page's order depends on it; purchases made since the backup are simply not counted.

## 5. Check (30 min)

```bash
curl -sI https://ehp.web.app/ | grep -i cache-control        # no-cache (the 2019 site sent max-age=3600)
curl -s https://ehp.web.app/ | grep -o 'main-[^"]*'          # the new bundle
node ops/rules-evaluations.js <time of step 1>
node ops/usage.js --project prod --days 2
```

- Post the launch announcement in Aktuelt as the maker. The text is `LAUNCH` in `ops/seed-emulator.js`.
- Ask one kitchen to reload its tablet and buy something. Tablets move to the new build on their next reload; until then they keep working on the old one. From now on, updates install themselves when a tablet has been idle for two minutes.
- Old cached pages: the 2019 site let browsers cache pages for an hour, so a tablet reloaded right after go-live can show the old build once more. Another reload fixes it.

## 6. Wrap up

```bash
gh pr create --base master --head develop --title "Release 2026-09-30" --body "Live on prod since <time>."
# merge it (the bottom-PR merge-async call from AGENTS.md), then:
git fetch && git tag live-2026-09-30 origin/master && git push origin live-2026-09-30
```

- Close #80 and #81 with a note that they shipped.
- Watch `ops/usage.js` for a week. The 19 and 20 September spikes came from the old accounting page (#58).
- Keep `~/kollegianeren-rollback` until the release has run a week without trouble.

## Rollback

**Rules** (instant, no app change):

```bash
cd ops && node deploy-rules.js prod projects/firebase-ehp/rulesets/00794461-cee0-43b4-a6c8-c070916efb56
```

**App.** Do not use the console's "Roll back": tablets that loaded the new build keep serving it from their service worker, and the 2019 site answers `ngsw.json` with index.html, which the worker cannot read. Deploy the bundle from step 0 instead:

```bash
cd ~/kollegianeren-rollback && firebase deploy --only hosting --project prod
```

It is the 2019 files plus a safety worker that removes the new one, clears its caches and reloads open tabs; `ngsw.json` returns 404, so the worker also removes itself. The 2019 build works on the new rules, so the rules can stay.

**Data.** The release writes only `sold` on products (the 2019 build ignores it). Restore of anything else: `ops/README.md`, Restore.

## After the release

In the dev project first, then prod, one at a time:

- #64 Auth hardening: email enumeration protection, password policy, authorised domains.
- #63 Restrict the Firebase API keys to our domains.
- #61 Rotate the Cloudinary secrets and restrict the upload preset (needs the Cloudinary console).
- #65 App Check (needs a reCAPTCHA key from the Google console).
- #80: `timestamp == request.time` is already enforced; checking that the product and resident exist would cost two reads per purchase, so it is left out.
