#!/usr/bin/env node
// Daily Firestore usage against the Spark caps, per US Pacific quota day.
//
//   node usage.js --project prod [--days 30] [--warn 35000]
//
// Exits 2 if today's reads are above --warn, so cron can alert on it.
const { init, parseArgs } = require('./lib/firebase');
const { SPARK, pacificMidnight, series } = require('./lib/quota');

const args = parseArgs();
const { projectId, accessToken } = init(args.project);
const DAYS = +(args.days || 30);
const WARN = +(args.warn || 35000);

(async () => {
  const today = pacificMidnight();
  const start = new Date(today.getTime() - (DAYS - 1) * 864e5);
  const end = new Date();
  // Hourly buckets summed into Pacific days, because Monitoring aligns daily buckets to UTC.
  const byDay = {};
  for (const [key, metric] of [['reads', 'document/read_count'], ['writes', 'document/write_count'], ['deletes', 'document/delete_count']]) {
    for (const p of await series(accessToken, projectId, metric, start, end, 3600)) {
      const day = pacificMidnight(new Date(Date.parse(p.end) - 1)).toISOString().slice(0, 10);
      (byDay[day] ||= { reads: 0, writes: 0, deletes: 0 })[key] += p.value;
    }
  }
  console.log(`${projectId}: Firestore usage per quota day (Spark caps: ${SPARK.reads} reads, ${SPARK.writes} writes)`);
  console.log('day (PT)     reads   writes  deletes');
  for (const day of Object.keys(byDay).sort()) {
    const d = byDay[day];
    const flag = d.reads >= SPARK.reads ? '  OVER CAP' : d.reads >= WARN ? '  high' : '';
    console.log(`${day}  ${String(d.reads).padStart(6)}  ${String(d.writes).padStart(6)}  ${String(d.deletes).padStart(6)}${flag}`);
  }
  const todayReads = byDay[today.toISOString().slice(0, 10)]?.reads || 0;
  if (todayReads > WARN) { console.error(`WARN: ${todayReads} reads today`); process.exit(2); }
})().catch(e => { console.error(e); process.exit(1); });
