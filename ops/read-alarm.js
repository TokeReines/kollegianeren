#!/usr/bin/env node
// Warns the maker about the free plan's read cap (50,000 a day, reset at midnight US Pacific,
// 09:00 Danish time) with a note in the maker's inbox (reports, 🚩), once a day per warning.
//
// - With Cloud Monitoring (a person's own login, e.g. on the laptop): the first time the day passes
//   each threshold (35,000 and 45,000).
// - Without it (a service account on the Spark plan: Monitoring answers "requires billing"): one
//   read as a probe; if Firestore says the quota is used up, a note straight away.
//
// From cron every half hour; no reads beyond the probe, one write per warning.
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
const fmt = n => n.toLocaleString('da-DK');

async function note(text) {
  if (args.dry) return console.log('  note:', text);
  await db.collection('reports').add({ kitchenId: 'kollegiet', target: 'quota', text, createdAt: FieldValue.serverTimestamp() });
}

(async () => {
  const day = pacificMidnight().toISOString().slice(0, 10);
  const state = STATE && fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
  const warned = state.day === day ? state.warned || [] : [];
  const reads = await usedToday(accessToken, projectId).catch(() => null);
  let due = [];
  if (reads != null) {
    due = THRESHOLDS.filter(t => reads >= t && !warned.includes(t));
    console.log(`${new Date().toISOString()} ${projectId}: ${reads} reads today (cap ${SPARK.reads})${due.length ? `, warning at ${due.at(-1)}` : ''}`);
    if (due.length) await note(`Læsninger i dag: ${fmt(reads)} af ${fmt(SPARK.reads)} (den gratis plan). Ved grænsen kan tabletterne ikke hente data før kl. 9.`);
  } else {
    // No Monitoring: is the quota used up? One read tells.
    const exhausted = await db.collection('kitchens').limit(1).get().then(() => false, e => /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(e?.message)));
    console.log(`${new Date().toISOString()} ${projectId}: no Monitoring, read quota ${exhausted ? 'USED UP' : 'ok'}`);
    if (exhausted && !warned.includes('exhausted')) {
      due = ['exhausted'];
      await note(`Dagens ${fmt(SPARK.reads)} læsninger er brugt op. Tabletterne kan ikke hente data før kl. 9 (dansk tid).`);
    }
  }
  if (due.length && STATE && !args.dry) fs.writeFileSync(STATE, JSON.stringify({ day, warned: [...warned, ...due] }));
})().catch(e => { console.error(e.message); process.exit(1); });
