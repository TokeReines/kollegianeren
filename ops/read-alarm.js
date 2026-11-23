#!/usr/bin/env node
// Warns the maker about the free plan's read cap (50,000 a day, reset at midnight US Pacific,
// 09:00 Danish time) with a note in the maker's inbox (reports, 🚩), and a push if ALARM_PUSH_URL
// is set (a POST of {title, message}, e.g. a Home Assistant webhook).
//
// - With Cloud Monitoring: the first time the day passes each threshold (25,000, 35,000 and
//   45,000), and when the last hour alone read more than --rate (4,000; a normal hour is under
//   1,500, and the night of 22 November read 7,000 to 9,500 an hour while every tablet stood idle).
//   The rate warning comes at most every three hours. On tokeserver, set QUOTA_PROJECT (lib/quota.js):
//   Monitoring refuses a service account on the Spark plan otherwise.
// - Without Monitoring: one read as a probe; if Firestore says the quota is used up, a note
//   straight away.
//
// From cron every half hour; no reads beyond the probe, one write per warning.
//
//   node read-alarm.js --project prod [--state FILE] [--at 25000,35000,45000] [--rate 4000] [--dry]
const fs = require('fs');
const { FieldValue } = require('firebase-admin/firestore');
const { init, parseArgs } = require('./lib/firebase');
const { SPARK, pacificMidnight, usedToday, usedRecently } = require('./lib/quota');

const args = parseArgs();
const { projectId, db, accessToken } = init(args.project);
const THRESHOLDS = String(args.at || '25000,35000,45000').split(',').map(Number).sort((a, b) => a - b);
const RATE = +(args.rate || 4000);
const RATE_EVERY_MS = 3 * 3600e3;
const STATE = args.state;
const fmt = n => n.toLocaleString('da-DK');

async function warn(title, message) {
  if (args.dry) return console.log('  warning:', title, '|', message);
  await db.collection('reports').add({ kitchenId: 'kollegiet', target: 'quota', text: `${title} ${message}`, createdAt: FieldValue.serverTimestamp() });
  if (process.env.ALARM_PUSH_URL) {
    const res = await fetch(process.env.ALARM_PUSH_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, message }) })
      .catch(e => ({ ok: false, status: e.message }));
    if (!res.ok) console.error(`  push failed: ${res.status}`);
  }
}

(async () => {
  const day = pacificMidnight().toISOString().slice(0, 10);
  const state = STATE && fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
  const warned = state.day === day ? state.warned || [] : [];
  let rateAt = state.rateAt || 0;
  const reads = await usedToday(accessToken, projectId).catch(e => (console.error(`  Monitoring: ${e.message.slice(0, 120)}`), null));
  let due = [];
  if (reads != null) {
    const lastHour = await usedRecently(accessToken, projectId, 60);
    due = THRESHOLDS.filter(t => reads >= t && !warned.includes(t));
    const racing = lastHour > RATE && Date.now() - rateAt > RATE_EVERY_MS;
    console.log(`${new Date().toISOString()} ${projectId}: ${reads} reads today, ${lastHour} the last hour (cap ${SPARK.reads})`
      + `${due.length ? `, warning at ${due.at(-1)}` : ''}${racing ? ', warning: fast' : ''}`);
    const hoursLeft = racing ? Math.max(0, Math.floor((SPARK.reads - reads) / lastHour)) : null;
    if (racing) {
      rateAt = Date.now();
      await warn(`Kollegianeren læser hurtigt: ${fmt(lastHour)} den sidste time.`,
        `${fmt(reads)} af ${fmt(SPARK.reads)} brugt i dag; i det tempo er resten væk om ca. ${hoursLeft} t. Nulstilles kl. 9.`);
    } else if (due.length) {
      await warn(`Kollegianeren: ${fmt(reads)} af ${fmt(SPARK.reads)} læsninger brugt i dag.`,
        `${fmt(lastHour)} den sidste time. Ved grænsen kan tabletterne ikke hente data før kl. 9.`);
    }
  } else {
    // No Monitoring: is the quota used up? One read tells.
    const exhausted = await db.collection('kitchens').limit(1).get().then(() => false, e => /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(e?.message)));
    console.log(`${new Date().toISOString()} ${projectId}: no Monitoring, read quota ${exhausted ? 'USED UP' : 'ok'}`);
    if (exhausted && !warned.includes('exhausted')) {
      due = ['exhausted'];
      await warn(`Kollegianeren: dagens ${fmt(SPARK.reads)} læsninger er brugt op.`, 'Tabletterne kan ikke hente data før kl. 9 (dansk tid).');
    }
  }
  if (STATE && !args.dry && (due.length || rateAt !== (state.rateAt || 0))) {
    fs.writeFileSync(STATE, JSON.stringify({ day, warned: [...warned, ...due], rateAt }));
  }
})().catch(e => { console.error(e.message); process.exit(1); });
