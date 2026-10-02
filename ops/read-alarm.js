#!/usr/bin/env node
// Warns the maker when the day's Firestore reads near the free plan's cap (50,000 a day, reset at
// midnight US Pacific, 09:00 Danish time): a note in the maker's inbox (reports, 🚩) the first time
// the day passes each threshold. From cron on tokeserver every half hour; costs no reads (Cloud
// Monitoring) and one write per warning.
//
//   node read-alarm.js --project prod [--state FILE] [--at 35000,45000] [--dry]
const fs = require('fs');
const { FieldValue } = require('firebase-admin/firestore');
const { init, parseArgs } = require('./lib/firebase');
const { SPARK, pacificMidnight, usedToday } = require('./lib/quota');

const args = parseArgs();
const { projectId, db, accessToken } = init(args.project);
const THRESHOLDS = String(args.at || '35000,45000').split(',').map(Number).sort((a, b) => a - b);
const STATE = args.state;

(async () => {
  const day = pacificMidnight().toISOString().slice(0, 10);
  const reads = await usedToday(accessToken, projectId);
  const state = STATE && fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
  const warned = state.day === day ? state.warned || [] : [];
  const due = THRESHOLDS.filter(t => reads >= t && !warned.includes(t));
  console.log(`${new Date().toISOString()} ${projectId}: ${reads} reads today (cap ${SPARK.reads})${due.length ? `, warning at ${due.at(-1)}` : ''}`);
  if (!due.length || args.dry) return;
  const text = `Læsninger i dag: ${reads.toLocaleString('da-DK')} af ${SPARK.reads.toLocaleString('da-DK')} (den gratis plan). `
    + 'Ved grænsen kan tabletterne ikke hente data før kl. 9. Se ops/usage.js og docs/ops.';
  await db.collection('reports').add({ kitchenId: 'kollegiet', target: 'quota', text, createdAt: FieldValue.serverTimestamp() });
  if (STATE) fs.writeFileSync(STATE, JSON.stringify({ day, warned: [...warned, ...due] }));
})().catch(e => { console.error(e.message); process.exit(1); });
