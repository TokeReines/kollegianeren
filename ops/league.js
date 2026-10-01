#!/usr/bin/env node
// Kollegiet's referee (docs/kollegiet.md, The league job). Not on the live path: the kitchens'
// tablets move the live tallies themselves. This settles what has to be checked across kitchens:
//
// - an ended battle: each kitchen's number recomputed from its real purchases, meals and taps,
//   written as the battle's result, a trophy for the winner and a post on the board. A tally that
//   is off from the real number is reported to the maker, and the result wins; a live achievement
//   the real number does not reach is taken back;
// - a closed poll: the secret ballots counted, the result written and posted;
// - once a day (--daily): standings (high-fives, badges) and the achievements that need history
//   (food club milestones, a plant-based month, the first open kitchen).
//
//   node league.js --project dev [--daily] [--dry] [--state <file>] [--max-reads 6000]
//   node league.js --emulator [--daily] [--loop 60]     # local emulators, every 60 seconds
//
// --state keeps how far it has got (cron on tokeserver): then a run reads only what ended or
// happened since the last one, and an idle run is 2 reads. Without it, the last two weeks are
// looked through and --daily counts everything again (by hand, on dev).
//
// A battle is claimed with a precondition on the document before anything is posted, so two runs
// at once (cron's 15-minute run and the daily one) never settle the same battle twice.
const fs = require('fs');
const { parseArgs } = require('./lib/firebase');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');

const args = parseArgs();
const DAY = 864e5;
// Posts and kudos from Kollegiet itself, not from a kitchen.
const SYSTEM = 'kollegiet';
// Most reads one run spends on recounting battles; a big battle waits for the next run.
const MAX_READS = Number(args['max-reads']) || 6000;
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

async function count(q) {
  const n = (await q.count().get()).data().count;
  reads += Math.max(1, Math.ceil(n / 1000));
  return n;
}

function loadState() {
  if (!args.state) return null;
  try {
    return JSON.parse(fs.readFileSync(args.state, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  if (!args.state || args.dry) return;
  fs.writeFileSync(args.state + '.tmp', JSON.stringify(state, null, 2));
  fs.renameSync(args.state + '.tmp', args.state);
}

const ms = t => (t && t.toMillis ? t.toMillis() : 0);
const winnersOf = scores => {
  const top = Math.max(0, ...Object.values(scores));
  return top > 0 ? Object.keys(scores).filter(k => scores[k] === top) : [];
};

// What a battle counts, for the result post: "med 14 øl".
const UNITS = { drinks: 'drikkevarer', beer: 'øl', mealDiners: 'spisende', plantMeals: '%', gym: 'fitness-ture' };

// Live achievements and what earns them (LIVE_ACHIEVEMENTS in src/app/interfaces/kollegiet.ts,
// earned() in firestore.rules).
const LIVE_NEEDS = {
  firstBattle: ['', 1], drinks100: ['drinks', 100], beer50: ['beer', 50], beer100: ['beer', 100],
  diners50: ['mealDiners', 50], gym25: ['gym', 25],
};

// The documents a battle's recount reads, from counts (1 read per 1000).
async function recountCost(battle) {
  let n = 0;
  for (const kid of battle.participants || []) {
    const k = db.collection('kitchens').doc(kid);
    if (battle.metric === 'drinks' || battle.metric === 'beer') {
      n += await count(k.collection('purchases').where('timestamp', '>=', battle.from).where('timestamp', '<', battle.to));
    } else if (battle.metric !== 'gym') {
      n += await count(k.collection('meals').where('date', '>=', battle.from).where('date', '<', battle.to));
    }
  }
  return n;
}

// A kitchen's real number in a battle, from its own data.
async function realScore(battle, kid, tally) {
  const k = db.collection('kitchens').doc(kid);
  const from = battle.from, to = battle.to;
  switch (battle.metric) {
    // Read and added up here: a sum over a time range would need a composite index. Once per
    // battle, when it has ended.
    case 'drinks': {
      const purchases = await get(k.collection('purchases').where('timestamp', '>=', from).where('timestamp', '<', to));
      return purchases.reduce((n, p) => n + (Number(p.get('amount')) || 0), 0);
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

// Claims the result: fails if another run changed the document since this one read it.
async function claim(doc, result) {
  if (args.dry) return true;
  return doc.ref.update({ result: { ...result, settledAt: FieldValue.serverTimestamp() } }, { lastUpdateTime: doc.updateTime })
    .then(() => true, e => {
      console.log(`  ${doc.ref.path} changed meanwhile (${e.code || e.message}), left for the next run`);
      return false;
    });
}

// Live achievements claimed in this battle that the real number does not reach.
async function takeBackAchievements(b, kid, real, kitchenNames) {
  const claimed = await get(db.collection('standings').doc(kid).collection('achievements').where('battle', '==', b.id));
  for (const a of claimed) {
    const need = LIVE_NEEDS[a.id];
    if (!need || real >= need[1]) continue;
    console.log(`  ${kitchenNames.get(kid) || kid}: ${a.id} taken back (real ${real})`);
    if (args.dry) continue;
    await a.ref.delete();
    await report(`battles/${b.id}`, `${kitchenNames.get(kid) || kid}: "${a.id}" taken back, real ${real} in "${b.title}"`);
  }
}

// Ended battles that are not settled. Returns the ones left for the next run.
async function settleBattles(ended, kitchenNames) {
  const left = [];
  let spent = 0;
  for (const doc of ended) {
    const b = { id: doc.id, ...doc.data() };
    const cost = await recountCost(b);
    if (spent && spent + cost > MAX_READS) {
      console.log(`battle ${b.id} "${b.title}": about ${cost} reads, waits for the next run`);
      left.push(doc);
      continue;
    }
    spent += cost;
    const tallies = new Map((await get(doc.ref.collection('tally'))).map(t => [t.id, t.data()]));
    const scores = {}, live = {};
    for (const kid of b.participants || []) {
      scores[kid] = await realScore(b, kid, tallies.get(kid));
      live[kid] = liveScore(b.metric, tallies.get(kid));
    }
    const winners = winnersOf(scores);
    console.log(`battle ${b.id} "${b.title}":`, scores, 'winners', winners);
    if (!await claim(doc, { scores, winners })) {
      left.push(doc);
      continue;
    }
    for (const kid of b.participants || []) {
      if (Math.abs(scores[kid] - live[kid]) > Math.max(3, scores[kid] * 0.1)) {
        await report(`battles/${b.id}`, `${kitchenNames.get(kid) || kid}: live ${live[kid]}, real ${scores[kid]} in "${b.title}"`);
      }
      await takeBackAchievements(b, kid, scores[kid], kitchenNames);
    }
    if (args.dry) continue;
    if (winners.length && (b.participants || []).length > 1) {
      const unit = UNITS[b.metric] ? (b.metric === 'plantMeals' ? ' %' : ` ${UNITS[b.metric]}`) : '';
      await post(`🏆 ${winners.map(w => kitchenNames.get(w) || w).join(' og ')} vandt "${b.title}" med ${scores[winners[0]]}${unit}!`);
      for (const w of winners) {
        await db.collection('standings').doc(w).set({ wins: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await db.collection('standings').doc(w).collection('achievements').doc('firstWin')
          .create({ battle: b.id, at: FieldValue.serverTimestamp() }).catch(() => undefined);
      }
    }
  }
  return left;
}

// Closed polls that are not counted. Returns the ones left for the next run.
async function settlePolls(closed, kitchenNames) {
  const left = [];
  for (const doc of closed) {
    const votes = {};
    for (const ballot of await get(doc.ref.collection('ballots'))) {
      const choice = ballot.get('choice');
      if (choice && choice !== ballot.id) votes[choice] = (votes[choice] || 0) + 1;
    }
    const winners = winnersOf(votes);
    console.log(`poll ${doc.id} "${doc.get('title')}":`, votes, 'winners', winners);
    if (!await claim(doc, { votes, winners })) {
      left.push(doc);
      continue;
    }
    if (args.dry) continue;
    if (winners.length) {
      await post(`🗳️ ${winners.map(w => kitchenNames.get(w) || w).join(' og ')} vandt afstemningen "${doc.get('title')}" med ${votes[winners[0]]} stemmer!`);
      for (const w of winners) {
        await db.collection('standings').doc(w).set({ titles: FieldValue.arrayUnion(doc.get('title')), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  }
  return left;
}

const ACH_NAMES = {
  dinners10: '10 madklub-middage', dinners50: '50 madklub-middage', dinners100: '100 madklub-middage',
  highfives10: '10 high-fives', firstOpenKitchen: 'Første åbne køkken', plantMonth: 'En måned med halvdelen plantebaseret',
};
const ACH_ICONS = { dinners10: '🥄', dinners50: '🍴', dinners100: '👨‍🍳', highfives10: '🙌', firstOpenKitchen: '🚪', plantMonth: '🥦' };

const isPlant = m => (m.get('tags') || []).some(t => t === 'vegetarian' || t === 'vegan');
// At least four dinners in a month, half of them plant-based.
const plantMonth = meals => meals.length >= 4 && meals.filter(isPlant).length * 2 >= meals.length;
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

async function award(kid, code, kitchenNames) {
  if (args.dry) return console.log(`  ${kitchenNames.get(kid)}: ${code}`);
  const ref = db.collection('standings').doc(kid).collection('achievements').doc(code);
  const created = await ref.create({ battle: null, at: FieldValue.serverTimestamp() }).then(() => true, () => false);
  if (created) await post(`${ACH_ICONS[code] || '🏅'} ${kitchenNames.get(kid)} har låst op for "${ACH_NAMES[code] || code}"!`);
}

// Once a day. With a state: only kudos and events since the last run, the food club totals as
// counts, and the plant-based month once a month. Without: everything again.
async function daily(now, kitchenNames, state) {
  const since = state?.dailyThrough;
  const kudos = await get(since
    ? db.collection('kudos').where('createdAt', '>', Timestamp.fromMillis(since)).where('createdAt', '<=', Timestamp.fromMillis(now))
    : db.collection('kudos'));
  const events = (await get(since
    ? db.collection('events').where('startsAt', '>', Timestamp.fromMillis(since)).where('startsAt', '<=', Timestamp.fromMillis(now))
    : db.collection('events').where('kind', '==', 'openKitchen')))
    .filter(e => e.get('kind') === 'openKitchen' && ms(e.get('startsAt')) <= now);
  const month = monthKey(new Date(now));
  // The month that just ended, the first run in a new month (or every month, without a state).
  const checkMonths = !since || state.monthChecked !== month;
  const prevStart = new Date(now); prevStart.setDate(1); prevStart.setHours(0, 0, 0, 0);
  const monthStart = prevStart.getTime();
  prevStart.setMonth(prevStart.getMonth() - 1);

  for (const kid of kitchenNames.keys()) {
    const got = kudos.filter(k => k.get('to') === kid && k.get('from') !== SYSTEM);
    const badges = {};
    got.filter(k => k.get('kind') === 'badge').forEach(k => badges[k.get('badge')] = (badges[k.get('badge')] || 0) + 1);
    const highfives = got.filter(k => k.get('kind') === 'highfive').length;
    const ref = db.collection('standings').doc(kid);
    let totalHighfives = highfives;
    if (got.length && !args.dry) {
      if (since) {
        await ref.set({ highfives: FieldValue.increment(highfives), badges: Object.fromEntries(Object.entries(badges)
          .map(([b, n]) => [b, FieldValue.increment(n)])), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        reads++;
        totalHighfives = (await ref.get()).get('highfives') || highfives;
      } else {
        await ref.set({ highfives, badges, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    const earned = [];
    const meals = db.collection('kitchens').doc(kid).collection('meals');
    const dinners = await count(meals.where('date', '<', Timestamp.fromMillis(now)));
    for (const [code, n] of [['dinners10', 10], ['dinners50', 50], ['dinners100', 100]]) if (dinners >= n) earned.push(code);
    if (totalHighfives >= 10) earned.push('highfives10');
    if (events.some(e => e.get('kitchenId') === kid)) earned.push('firstOpenKitchen');
    if (checkMonths && dinners >= 4) {
      const from = since ? prevStart.getTime() : 0;
      const list = await get(meals.where('date', '>=', Timestamp.fromMillis(from)).where('date', '<', Timestamp.fromMillis(since ? monthStart : now)));
      const byMonth = new Map();
      for (const m of list) {
        const key = monthKey(m.get('date').toDate());
        byMonth.set(key, [...(byMonth.get(key) || []), m]);
      }
      if ([...byMonth.values()].some(plantMonth)) earned.push('plantMonth');
    }
    if (!got.length && !earned.length) continue;
    console.log(`${kitchenNames.get(kid)}: +${highfives} high-fives, badges`, badges, 'achievements', earned);
    for (const code of earned) await award(kid, code, kitchenNames);
  }
  return { dailyThrough: now, monthChecked: month };
}

async function run() {
  reads = 0;
  const now = Date.now();
  const state = loadState();
  const kitchenNames = new Map();
  const lazyNames = async () => kitchenNames.size ? kitchenNames : names().then(m => { m.forEach((v, k) => kitchenNames.set(k, v)); return kitchenNames; });
  // What ended since the last run (with a state), or in the last two weeks; names only when there
  // is something to settle.
  const ended = (name, field, since) => get(db.collection(name).where(field, '<=', Timestamp.fromMillis(now))
    .where(field, '>', Timestamp.fromMillis(since ?? now - 14 * DAY))).then(docs => docs.filter(d => !d.get('result')));
  // The next run starts at the earliest one left over, or now.
  const through = (left, field) => left.length ? Math.min(...left.map(d => ms(d.get(field)))) - 1 : now;

  const battles = await ended('battles', 'to', state?.battlesThrough);
  const battlesLeft = battles.length ? await settleBattles(battles, await lazyNames()) : [];
  const polls = await ended('polls', 'closesAt', state?.pollsThrough);
  const pollsLeft = polls.length ? await settlePolls(polls, await lazyNames()) : [];
  const next = { ...state, battlesThrough: through(battlesLeft, 'to'), pollsThrough: through(pollsLeft, 'closesAt') };
  if (args.daily) Object.assign(next, await daily(now, await lazyNames(), state));
  if (state) saveState(next);
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
