#!/usr/bin/env node
// Kollegiet's referee (docs/kollegiet.md, The league job). Not on the live path: the kitchens'
// tablets move the live tallies themselves. This settles what has to be checked across kitchens:
//
// - an ended battle: each kitchen's number recomputed from its real purchases, meals and taps,
//   written as the battle's result, a trophy for the winner and a post on the board. A tally that
//   is off from the real number is reported to the maker, and the result wins;
// - a closed poll: the secret ballots counted, the result written and posted;
// - once a day (--daily): standings (wins, high-fives, badges) and the achievements that need
//   history (food club milestones, a plant-based month, the first open kitchen).
//
//   node league.js --project dev [--daily] [--dry]
//   node league.js --emulator [--daily] [--loop 60]     # local emulators, every 60 seconds
//
// An idle run is two queries (2 reads). Cron: every 15 minutes, with --daily once at 08:15 UTC.
const { parseArgs } = require('./lib/firebase');
const { Timestamp, FieldValue, AggregateField } = require('firebase-admin/firestore');

const args = parseArgs();
const DAY = 864e5;
// Posts and kudos from Kollegiet itself, not from a kitchen.
const SYSTEM = 'kollegiet';
let db;
let reads = 0;

function connect() {
  if (args.emulator) {
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8181';
    const { initializeApp } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');
    db = getFirestore(initializeApp({ projectId: 'demo-kollegianeren' }));
  } else {
    db = require('./lib/firebase').init(args.project).db;
  }
}

async function get(q) {
  const s = await q.get();
  reads += Math.max(1, s.size);
  return s.docs;
}

const ms = t => (t && t.toMillis ? t.toMillis() : 0);
const winnersOf = scores => {
  const top = Math.max(0, ...Object.values(scores));
  return top > 0 ? Object.keys(scores).filter(k => scores[k] === top) : [];
};

// A kitchen's real number in a battle, from its own data.
async function realScore(battle, kid, tally) {
  const k = db.collection('kitchens').doc(kid);
  const from = battle.from, to = battle.to;
  switch (battle.metric) {
    case 'drinks': {
      const agg = await k.collection('purchases').where('timestamp', '>=', from).where('timestamp', '<', to)
        .aggregate({ units: AggregateField.sum('amount') }).get();
      reads += 1;
      return agg.data().units || 0;
    }
    case 'beer': {
      const beer = new Set((await get(k.collection('products').where('category', '==', 'beer'))).map(d => d.id));
      if (!beer.size) return 0;
      const purchases = await get(k.collection('purchases').where('timestamp', '>=', from).where('timestamp', '<', to));
      return purchases.filter(p => beer.has(p.get('productId'))).reduce((n, p) => n + (Number(p.get('amount')) || 0), 0);
    }
    case 'mealDiners':
    case 'plantMeals': {
      const meals = await get(k.collection('meals').where('date', '>=', from).where('date', '<', to));
      if (battle.metric === 'mealDiners') return meals.reduce((n, m) => n + (m.get('signups') || []).length, 0);
      const plant = meals.filter(m => (m.get('tags') || []).some(t => t === 'vegetarian' || t === 'vegan')).length;
      return meals.length ? Math.round(100 * plant / meals.length) : 0;
    }
    case 'gym':
      return tally?.value || 0;
    default:
      return 0;
  }
}

function liveScore(metric, tally) {
  if (!tally) return 0;
  if (metric === 'plantMeals') return tally.total ? Math.round(100 * tally.value / tally.total) : 0;
  return tally.value || 0;
}

async function post(text) {
  if (args.dry) return console.log('  post:', text);
  await db.collection('posts').add({ kitchenId: SYSTEM, text, to: null, parentId: null, createdAt: FieldValue.serverTimestamp() });
}

async function report(target, text) {
  if (args.dry) return console.log('  report:', text);
  await db.collection('reports').add({ kitchenId: SYSTEM, target, text, createdAt: FieldValue.serverTimestamp() });
}

async function names() {
  const docs = await get(db.collection('kitchens'));
  return new Map(docs.map(d => [d.id, d.get('name') || d.id]));
}

// Battles that ended in the last two weeks and are not settled.
async function settleBattles(ended, kitchenNames) {
  for (const doc of ended) {
    const b = { id: doc.id, ...doc.data() };
    const tallies = new Map((await get(doc.ref.collection('tally'))).map(t => [t.id, t.data()]));
    const scores = {};
    for (const kid of b.participants || []) {
      const real = await realScore(b, kid, tallies.get(kid));
      const live = liveScore(b.metric, tallies.get(kid));
      scores[kid] = real;
      if (Math.abs(real - live) > Math.max(3, real * 0.1)) {
        await report(`battles/${b.id}`, `${kitchenNames.get(kid) || kid}: live ${live}, real ${real} in "${b.title}"`);
      }
    }
    const winners = winnersOf(scores);
    console.log(`battle ${b.id} "${b.title}":`, scores, 'winners', winners);
    if (args.dry) continue;
    await doc.ref.update({ result: { scores, winners, settledAt: FieldValue.serverTimestamp() } });
    if (winners.length && (b.participants || []).length > 1) {
      const unit = b.metric === 'plantMeals' ? ' %' : '';
      await post(`🏆 ${winners.map(w => kitchenNames.get(w) || w).join(' og ')} vandt "${b.title}" med ${scores[winners[0]]}${unit}!`);
      for (const w of winners) {
        await db.collection('standings').doc(w).set({ wins: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await db.collection('standings').doc(w).collection('achievements').doc('firstWin')
          .create({ battle: b.id, at: FieldValue.serverTimestamp() }).catch(() => undefined);
      }
    }
  }
}

// Polls that closed in the last two weeks and are not counted.
async function settlePolls(closed, kitchenNames) {
  for (const doc of closed) {
    const votes = {};
    for (const ballot of await get(doc.ref.collection('ballots'))) {
      const choice = ballot.get('choice');
      if (choice && choice !== ballot.id) votes[choice] = (votes[choice] || 0) + 1;
    }
    const winners = winnersOf(votes);
    console.log(`poll ${doc.id} "${doc.get('title')}":`, votes, 'winners', winners);
    if (args.dry) continue;
    await doc.ref.update({ result: { votes, winners, settledAt: FieldValue.serverTimestamp() } });
    if (winners.length) {
      await post(`🗳️ ${winners.map(w => kitchenNames.get(w) || w).join(' og ')} vandt afstemningen "${doc.get('title')}" med ${votes[winners[0]]} stemmer!`);
      for (const w of winners) {
        await db.collection('standings').doc(w).set({ titles: FieldValue.arrayUnion(doc.get('title')), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  }
}

// Once a day: counts for the profiles, and the achievements that need history.
async function daily(now, kitchenNames) {
  const kudos = await get(db.collection('kudos'));
  const battles = await get(db.collection('battles'));
  const events = await get(db.collection('events').where('kind', '==', 'openKitchen'));
  for (const kid of kitchenNames.keys()) {
    const got = kudos.filter(k => k.get('to') === kid);
    const badges = {};
    got.filter(k => k.get('kind') === 'badge').forEach(k => badges[k.get('badge')] = (badges[k.get('badge')] || 0) + 1);
    const highfives = got.filter(k => k.get('kind') === 'highfive').length;
    const wins = battles.filter(b => (b.get('result')?.winners || []).includes(kid) && (b.get('participants') || []).length > 1).length;
    const meals = await get(db.collection('kitchens').doc(kid).collection('meals').where('date', '<', Timestamp.fromMillis(now)));
    const earned = [];
    for (const [code, n] of [['dinners10', 10], ['dinners50', 50], ['dinners100', 100]]) if (meals.length >= n) earned.push(code);
    if (highfives >= 10) earned.push('highfives10');
    if (events.some(e => e.get('kitchenId') === kid && ms(e.get('startsAt')) < now)) earned.push('firstOpenKitchen');
    const byMonth = new Map();
    for (const m of meals) {
      const d = m.get('date').toDate(), key = `${d.getFullYear()}-${d.getMonth()}`;
      const e = byMonth.get(key) || { all: 0, plant: 0 };
      e.all++;
      if ((m.get('tags') || []).some(t => t === 'vegetarian' || t === 'vegan')) e.plant++;
      byMonth.set(key, e);
    }
    if ([...byMonth.values()].some(e => e.all >= 4 && e.plant * 2 >= e.all)) earned.push('plantMonth');
    if (!got.length && !wins && !earned.length) continue;
    console.log(`${kitchenNames.get(kid)}: wins ${wins}, high-fives ${highfives}, badges`, badges, 'achievements', earned);
    if (args.dry) continue;
    const ref = db.collection('standings').doc(kid);
    await ref.set({ wins, highfives, badges, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    for (const code of earned) {
      const created = await ref.collection('achievements').doc(code).create({ battle: null, at: FieldValue.serverTimestamp() })
        .then(() => true, () => false);
      if (created) await post(`${ACH_ICONS[code] || '🏅'} ${kitchenNames.get(kid)} har låst op for "${ACH_NAMES[code] || code}"!`);
    }
  }
}

const ACH_NAMES = {
  dinners10: '10 madklub-middage', dinners50: '50 madklub-middage', dinners100: '100 madklub-middage',
  highfives10: '10 high-fives', firstOpenKitchen: 'Første åbne køkken', plantMonth: 'En måned med halvdelen plantebaseret',
};
const ACH_ICONS = { dinners10: '🥄', dinners50: '🍴', dinners100: '👨‍🍳', highfives10: '🙌', firstOpenKitchen: '🚪', plantMonth: '🥦' };

async function run() {
  reads = 0;
  const now = Date.now();
  const kitchenNames = new Map();
  const lazyNames = async () => kitchenNames.size ? kitchenNames : names().then(m => { m.forEach((v, k) => kitchenNames.set(k, v)); return kitchenNames; });
  // Names only when there is something to settle.
  const recent = (name, field) => get(db.collection(name).where(field, '<=', Timestamp.fromMillis(now))
    .where(field, '>=', Timestamp.fromMillis(now - 14 * DAY))).then(docs => docs.filter(d => !d.get('result')));
  const battles = await recent('battles', 'to');
  if (battles.length) await settleBattles(battles, await lazyNames());
  const polls = await recent('polls', 'closesAt');
  if (polls.length) await settlePolls(polls, await lazyNames());
  if (args.daily) await daily(now, await lazyNames());
  console.log(`${new Date().toISOString()} league: ${reads} reads`);
}

(async () => {
  connect();
  if (!args.emulator && !args.project) throw new Error('Missing --project (dev, prod) or --emulator');
  await run();
  if (args.loop) {
    if (!args.emulator) throw new Error('--loop is for the emulators only');
    setInterval(() => run().catch(e => console.error(e.message)), Number(args.loop) * 1000);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
