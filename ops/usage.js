#!/usr/bin/env node
// Daily Firestore usage against the Spark caps, per US Pacific quota day.
//
//   node usage.js --project prod [--days 30] [--warn 35000]
//
// Exits 2 if today's reads are above --warn, so cron can alert on it.
const { init, parseArgs } = require('./lib/firebase');
const { SPARK, pacificMidnight, dailyUsage } = require('./lib/quota');

const args = parseArgs();
const { projectId, accessToken } = init(args.project);
const DAYS = +(args.days || 30);
const WARN = +(args.warn || 35000);

(async () => {
  const today = pacificMidnight();
  const days = await dailyUsage(accessToken, projectId, DAYS);
  console.log(`${projectId}: Firestore usage per quota day (Spark caps: ${SPARK.reads} reads, ${SPARK.writes} writes)`);
  console.log('day (PT)     reads   writes  deletes');
  for (const d of days) {
    const flag = d.reads >= SPARK.reads ? '  OVER CAP' : d.reads >= WARN ? '  high' : '';
    console.log(`${d.day}  ${String(d.reads).padStart(6)}  ${String(d.writes).padStart(6)}  ${String(d.deletes).padStart(6)}${flag}`);
  }
  const todayReads = days.find(d => d.day === today.toISOString().slice(0, 10))?.reads || 0;
  if (todayReads > WARN) { console.error(`WARN: ${todayReads} reads today`); process.exit(2); }
})().catch(e => { console.error(e); process.exit(1); });
