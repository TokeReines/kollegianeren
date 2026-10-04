#!/usr/bin/env node
// Statistik without reading every purchase: from the nightly backup (ops/backup.js) on tokeserver,
// one summary per kitchen of the last SUMMARY_DAYS days, per Danish day, written to
// kitchens/{kid}/summaries/stats. The app reads it (1 read) plus the purchases since `through`.
// Also Regnskab's summary, one document per kitchen and month (lib/accounts-summary.js), and
// adminStats/nightly with when the backup and this job last ran, for the Admin page, and Kollegiet's
// archive, a document a month (lib/kollegiet-archive.js).
// Purchases taken back after they were backed up are left out of both.
// Costs no reads (the backup files are local) and about 15 writes per kitchen.
//
//   node stats-summary.js --project prod --from ~/kollegianeren-backups/firebase-ehp [--dry]
//
// The per-day shape matches DaySummary in src/app/components/stats/stats.ts: kr, n (purchases),
// u (units), p ({"productId|name": [kr, units]}), h ({hour: purchases}), b (buyer ids).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');
const { init, parseArgs } = require('./lib/firebase');
const { summariseAccounts, nextDay, before } = require('./lib/accounts-summary');
const { archive } = require('./lib/kollegiet-archive');

const SUMMARY_DAYS = 92;
// The backup keeps a year of purchases (backup.js --keep-days).
const KEEP_DAYS = 365;
// Firestore's limit is 1 MiB a document; a bigger month is left to the app's full read.
const MAX_DOC = 900e3;
const TZ = 'Europe/Copenhagen';
const args = parseArgs();
const FROM = String(args.from || path.join(require('os').homedir(), 'kollegianeren-backups/firebase-ehp'));
const { db } = init(args.project);

const readNdjson = file => zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
// A purchase's Danish day ("2026-10-01") and hour.
function local(ms) {
  const p = Object.fromEntries(parts.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
}
// A backed-up timestamp to the microsecond, as Firestore keeps it: the app reads the purchases
// after `through`, and a rounded one would read the last summarised purchase again.
const tsOf = t => t?.s ? { s: t.s, n: t.n || 0 } : null;
const msOf = t => t.s * 1000 + Math.floor(t.n / 1e6);

function summarise(purchases, sinceDay) {
  const days = {};
  let through = null;
  for (const p of purchases) {
    const ts = tsOf(p.timestamp);
    if (!ts) continue;
    if (!through || before(through, ts) < 0) through = ts;
    const { day, hour } = local(msOf(ts));
    if (day < sinceDay) continue;
    const price = Number(p.price) || 0, amount = Number(p.amount) || 0;
    const d = days[day] || (days[day] = { kr: 0, n: 0, u: 0, p: {}, h: {}, b: [] });
    d.kr += price;
    d.n++;
    d.u += amount;
    const key = `${p.productId}|${p.productName}`;
    const row = d.p[key] || (d.p[key] = [0, 0]);
    row[0] += price;
    row[1] += amount;
    d.h[hour] = (d.h[hour] || 0) + 1;
    if (!d.b.includes(p.userId)) d.b.push(p.userId);
  }
  for (const d of Object.values(days)) {
    d.kr = Math.round(d.kr * 100) / 100;
    for (const row of Object.values(d.p)) row[0] = Math.round(row[0] * 100) / 100;
  }
  return { days, through };
}

(async () => {
  const pdir = path.join(FROM, 'purchases');
  const since = local(Date.now() - SUMMARY_DAYS * 864e5).day;
  const today = local(Date.now()).day;
  // The first whole day the backup still keeps.
  const kept = nextDay(local(Date.now() - KEEP_DAYS * 864e5).day);
  // How far back each kitchen's backup is complete: all of the window once backfilled, else from
  // the oldest purchase it has reached. The app only uses a summary for periods it fully covers.
  const state = JSON.parse(fs.readFileSync(path.join(FROM, 'state.json'), 'utf8'));
  // A backup still running has written purchases but may not yet have read what was taken back.
  // Its file names start with its start time, which is after the last finished run ended.
  const finished = (state.lastRun?.at || '').replace(/[:.]/g, '-');
  const files = fs.readdirSync(pdir).flatMap(kid => fs.readdirSync(path.join(pdir, kid)));
  if (files.some(f => f.slice(0, finished.length) > finished)) {
    console.log(`the backup is still running (last finished ${state.lastRun?.at}), nothing written`);
    return;
  }
  // Only kitchens that still exist, as of the backup's newest snapshot: the purchase files of a
  // kitchen deleted since stay in the backup, and writing its summaries would bring its path back.
  const snaps = fs.readdirSync(path.join(FROM, 'snapshots')).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const latest = snaps.length ? path.join(FROM, 'snapshots', snaps[snaps.length - 1], 'kitchens.ndjson.gz') : null;
  const existing = latest && fs.existsSync(latest) ? new Set(readNdjson(latest).map(r => r.path.split('/').pop())) : null;
  let writes = 0;
  for (const kid of fs.readdirSync(pdir)) {
    if (existing && !existing.has(kid)) {
      console.log(`${kid}: no longer a kitchen, skipped`);
      continue;
    }
    // Later files overwrite earlier copies of a purchase (the names start with the run time).
    const byPath = new Map();
    for (const f of fs.readdirSync(path.join(pdir, kid)).sort()) for (const r of readNdjson(path.join(pdir, kid, f))) byPath.set(r.path, r.data);
    // Taken back after they were backed up: backup.js keeps the ids of the app's notes.
    const rdir = path.join(FROM, 'removed', kid);
    const removed = new Set(fs.existsSync(rdir) ? fs.readdirSync(rdir).flatMap(f => readNdjson(path.join(rdir, f)).map(r => r.id)) : []);
    for (const p of [...byPath.keys()]) if (removed.has(p.split('/').pop())) byPath.delete(p);
    const st = state.kitchens?.[kid] || {};
    const coveredFrom = st.backfillDone ? since : st.oldest ? [since, local(st.oldest.s * 1000).day].sort()[1] : null;
    const { days, through } = summarise([...byPath.values()], coveredFrom || since);
    const size = JSON.stringify(days).length;
    const at = t => t ? new Date(msOf(t)).toISOString() : '-';
    console.log(`${kid}: ${byPath.size} purchases backed up, ${removed.size} taken back, complete from ${coveredFrom || '-'}, ${Object.keys(days).length} days, through ${at(through)}, ${Math.round(size / 1024)} KB`);
    if (!through || !coveredFrom) continue;
    if (!args.dry) {
      await db.doc(`kitchens/${kid}/summaries/stats`).set({ days, since: coveredFrom, through: new Timestamp(through.s, through.n), computedAt: FieldValue.serverTimestamp() });
      writes++;
    }

    // Regnskab, as far back as the backup is complete: from the day after the oldest purchase it
    // has reached, as that day may be partly read.
    const accountsFrom = st.backfillDone ? kept : [kept, nextDay(local(st.oldest.s * 1000).day)].sort()[1];
    const purchases = [...byPath].map(([p, data]) => ({ id: p.split('/').pop(), ts: tsOf(data.timestamp), data }));
    const accounts = summariseAccounts(purchases, { removed, since: accountsFrom, today, local });
    if (!accounts.through) continue;
    const removedThrough = st.removedThrough ? new Timestamp(st.removedThrough.s, st.removedThrough.n) : new Timestamp(0, 0);
    const sizes = [];
    for (const [month, monthDays] of Object.entries(accounts.months)) {
      const bytes = JSON.stringify(monthDays).length;
      sizes.push(`${month} ${Math.round(bytes / 1024)} KB`);
      if (bytes > MAX_DOC) {
        console.log(`  ${month} is too big (${bytes} bytes), left out`);
        continue;
      }
      if (args.dry) continue;
      await db.doc(`kitchens/${kid}/summaries/accounts-${month}`).set({
        days: monthDays, since: accountsFrom, through: new Timestamp(accounts.through.s, accounts.through.n), removedThrough,
        computedAt: FieldValue.serverTimestamp(),
      });
      writes++;
    }
    console.log(`  Regnskab from ${accountsFrom} through ${at(accounts.through)}: ${sizes.join(', ')}`);
  }
  // Kollegiet's archive, a document a month (lib/kollegiet-archive.js), from the backup's Kollegiet files.
  const kdir = path.join(FROM, 'kollegiet');
  if (fs.existsSync(kdir)) {
    const load = name => {
      const f = path.join(kdir, `${name}.ndjson.gz`);
      return fs.existsSync(f) ? readNdjson(f).map(r => ({ ...r.data, id: r.path.split('/').pop() })) : [];
    };
    const months = archive({ battles: load('battles'), polls: load('polls'), kudos: load('kudos'), posts: load('posts') },
      at => local(at).day.slice(0, 7));
    for (const [month, data] of Object.entries(months)) {
      if (args.dry) continue;
      await db.doc(`archive/${month}`).set({ ...data, month, computedAt: FieldValue.serverTimestamp() });
      writes++;
    }
    console.log(`archive: ${Object.entries(months).map(([m, d]) => `${m} (${d.battles.length} battles, ${d.polls.length} votes, ${Object.keys(d.kudos).length} kitchens with kudos, ${d.notes.length} notes)`).join(', ') || 'nothing yet'}`);
  }

  if (!args.dry) {
    await db.doc('adminStats/nightly').set({
      backupAt: state.lastRun?.at ? Timestamp.fromDate(new Date(state.lastRun.at)) : null, summariesAt: FieldValue.serverTimestamp(),
    });
    writes++;
  }
  console.log(`${writes} documents written`);
})().catch(e => { console.error(e.message); process.exit(1); });
