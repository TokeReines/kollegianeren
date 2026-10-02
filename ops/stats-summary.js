#!/usr/bin/env node
// Statistik without reading every purchase: from the nightly backup (ops/backup.js) on tokeserver,
// one summary per kitchen of the last SUMMARY_DAYS days, per Danish day, written to
// kitchens/{kid}/summaries/stats. The app reads it (1 read) plus the purchases since `through`.
// Costs no reads (the backup files are local) and one write per kitchen.
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

const SUMMARY_DAYS = 92;
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

function summarise(purchases, sinceDay) {
  const days = {};
  let through = 0;
  for (const p of purchases) {
    const ms = p.timestamp ? p.timestamp.s * 1000 + Math.floor((p.timestamp.n || 0) / 1e6) : 0;
    if (!ms) continue;
    through = Math.max(through, ms);
    const { day, hour } = local(ms);
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
  // How far back each kitchen's backup is complete: all of the window once backfilled, else from
  // the oldest purchase it has reached. The app only uses a summary for periods it fully covers.
  const state = JSON.parse(fs.readFileSync(path.join(FROM, 'state.json'), 'utf8'));
  let writes = 0;
  for (const kid of fs.readdirSync(pdir)) {
    // Later files overwrite earlier copies of a purchase (the names start with the run time).
    const byPath = new Map();
    for (const f of fs.readdirSync(path.join(pdir, kid)).sort()) for (const r of readNdjson(path.join(pdir, kid, f))) byPath.set(r.path, r.data);
    const st = state.kitchens?.[kid] || {};
    const coveredFrom = st.backfillDone ? since : st.oldest ? [since, local(st.oldest.s * 1000).day].sort()[1] : null;
    const { days, through } = summarise([...byPath.values()], coveredFrom || since);
    const size = JSON.stringify(days).length;
    console.log(`${kid}: ${byPath.size} purchases backed up, complete from ${coveredFrom || '-'}, ${Object.keys(days).length} days, through ${through ? new Date(through).toISOString() : '-'}, ${Math.round(size / 1024)} KB`);
    if (args.dry || !through || !coveredFrom) continue;
    await db.doc(`kitchens/${kid}/summaries/stats`).set({ days, since: coveredFrom, through: Timestamp.fromMillis(through), computedAt: FieldValue.serverTimestamp() });
    writes++;
  }
  console.log(`${writes} summaries written`);
})().catch(e => { console.error(e.message); process.exit(1); });
