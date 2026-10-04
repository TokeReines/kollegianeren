#!/usr/bin/env node
// Dev as a staging dorm: the kitchens copied from prod and the demo kitchen made lively, with every
// feature filled in, and the junk from trying things out removed. Never on prod. Re-runnable.
//
//   node seed-staging.js --project dev [--dry] [--wipe]
//
// Kitchens fall in three groups:
// - protected: a login that is not a test login (a real tester) and purchases of its own. Never
//   touched, and left out of everything made here;
// - staging: 100 purchases or more, or the demo kitchen (demo-mellemste-7);
// - junk: the rest (empty kitchens from trying the register page, near-empty copies, test rivals).
//
// --wipe deletes the junk kitchens with their test logins (@kitchen.test; other accounts stay,
// without a kitchen), and every Kollegiet document a protected kitchen did not write or get.
// Then, relative to now:
// - purchases topped up from each staging kitchen's newest one to now, at its usual pace;
// - food club: two dinners a week for six weeks with their expenses (sometimes from two residents),
//   most split into Regnskab, and a few ahead with sign-ups open, some with shopping in already;
// - Regnskab: a MobilePay number, and last month half paid (one with an amount changed since);
// - profiles with things to lend, notes (at most 3 a kitchen) with replies and borrow questions,
//   events (one over a weekend), battles won over two months with standings, a live one, a food
//   club month and a challenge, votes closed and open, and high-fives and badges with reasons.
// Then run: node league.js --project dev --daily, backup.js and stats-summary.js (summaries, archive).
const { Timestamp } = require('firebase-admin/firestore');
const { init, parseArgs } = require('./lib/firebase');

const args = parseArgs();
const { db, auth, projectId } = init(args.project);
if (projectId === 'firebase-ehp') throw new Error('Never on prod');
const DRY = !!args.dry;
const HOME = 'demo-mellemste-7';

const now = Date.now();
const M = 60e3, H = 3600e3, D = 864e5;
const T = ms => Timestamp.fromMillis(Math.round(ms));
// Seeded, so a run picks the same names and texts for the same kitchens.
let seed = 20261004;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = a => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const shuffle = a => a.map(x => [rnd(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at = (daysAgo, hour, minute = 0) => { const d = new Date(now - daysAgo * D); d.setHours(hour, minute, 0, 0); return d.getTime(); };
const log = (...m) => console.log(...m);

const PROFILES = {
  'Ny2': ['🐙', 'teal', 'Tavlens bedste udsigt og den mest larmende kaffemaskine.', ['Raclette-grill', 'Beerpong-bord']],
  'Ny3': ['🍕', 'blue', 'Pizza søndag, altid.', ['Pizzasten', 'Stor gryde']],
  'Ny6': ['🎉', 'purple', 'Festkøkkenet på Ny. Vi har en discokugle.', ['Discokugle', 'Højtaler', 'Lyskæde']],
  'Ny7': ['🎸', 'orange', 'Guitar i køkkenet hver torsdag.', ['Guitar', 'Brætspil']],
  'Ny8': ['🦊', 'amber', 'Små men seje, og altid kaffe på kanden.', ['Vaffeljern']],
  'Gl4': ['🔥', 'red', 'Åbent køkken hver fredag. Medbring godt humør.', ['Grill', 'Partytelt']],
  'gl2': ['🍝', 'green', 'Pasta er en livsstil.', ['Pastamaskine']],
  'Gl8': ['⚽', 'lime', 'Fodbold på storskærm i weekenden.', ['Projektor', 'Fodboldspil']],
  'Ml5': ['🌮', 'pink', 'Taco-tirsdag siden 2019.', ['Tortillapresse']],
  'Ml8': ['🏋️', 'green', 'Halvdelen af os er i fitness, resten er i sofaen.', ['Kettlebells', 'Yogamåtter']],
  'Mellemste 7': ['🌻', 'amber', 'Plantebaseret madklub tre gange om ugen.', ['Stor gryde', 'Riskoger']],
};
const MENUS = [['Lasagne', ['meat', 'lactoseFree']], ['Linsegryde', ['vegan']], ['Tacos', ['meat']], ['Grøntsagssuppe', ['vegan', 'glutenFree']],
  ['Pasta carbonara', ['pork']], ['Kylling i karry', ['meat']], ['Fiskefrikadeller', ['fish']], ['Risotto', ['vegetarian']],
  ['Chili sin carne', ['vegan']], ['Burgere', ['meat']], ['Falafel med hummus', ['vegan']], ['Shakshuka', ['vegetarian']]];
const NOTES = ['Åbent køkken i aften fra kl. 21! Vi har fået en ny højtaler.', 'Nogen der vil med til koncert på fredag?',
  'Vi har lavet for meget suppe. Kom og tag en skål.', 'Hvem har lånt vores gule spand?', 'Brætspilsaften søndag kl. 19, alle er velkomne.',
  'Fodbold på storskærm lørdag kl. 18.', 'Vi søger en makker til fitness om morgenen.', 'Tak for i går, det var en fed fest!',
  'Nogen der har en cykelpumpe?', 'Quiz i fællesrummet torsdag. Lav et hold!', 'Vi bager boller søndag morgen, kom forbi.',
  'Ny kaffemaskine i køkkenet. Den larmer, men kaffen er god.'];
const REPLIES = ['Vi kommer!', 'Fedt, vi er med.', 'Kan ikke i år, men god fornøjelse.', 'Lyder hyggeligt!', 'Vi tager chips med.',
  'Hvornår starter det?', 'Den har vi! Kom og hent den.', 'Haha, klassisk.', 'Tæl os med.'];
const REASONS = { goodFriends: ['Lånte os jeres raclette-grill', 'Hjalp os med flytningen'], bestParty: ['Fredagens fest var vild', 'Bedste tema-fest i år'],
  bestFood: ['Den lasagne!', 'Mad til hele gangen'], helpful: ['Bar vores sofa op', 'Fandt vores nøgler'], recycling: ['Sorterer som verdensmestre'],
  plantBased: ['Den bedste linsegryde i Egmont'], cosy: ['Altid stearinlys og te'], loud: ['Vi kunne høre jer fra Gl', 'Højtaleren var for god'] };

async function deleteQuery(q) {
  const snap = await q.get();
  for (const d of snap.docs) if (!DRY) await db.recursiveDelete(d.ref);
  return snap.size;
}

async function classify() {
  const users = [];
  let page;
  do { const r = await auth.listUsers(1000, page); users.push(...r.users); page = r.pageToken; } while (page);
  const byUid = new Map(users.map(u => [u.uid, u]));
  const memberships = (await db.collection('memberships').get()).docs.map(d => ({ uid: d.id, kid: d.get('kitchenId'), ref: d.ref }));
  const groups = { protected: [], staging: [], junk: [] };
  for (const k of (await db.collection('kitchens').get()).docs) {
    const uids = [...new Set([...(byUid.has(k.id) ? [k.id] : []), ...memberships.filter(m => m.kid === k.id).map(m => m.uid)])];
    const real = uids.some(uid => byUid.get(uid)?.email && !byUid.get(uid).email.endsWith('@kitchen.test'));
    const purchases = (await k.ref.collection('purchases').count().get()).data().count;
    const kitchen = { id: k.id, name: k.get('name'), ref: k.ref, uids, purchases };
    if (real && purchases > 0) groups.protected.push(kitchen);
    else if (purchases >= 100 || k.id === HOME) groups.staging.push(kitchen);
    else groups.junk.push(kitchen);
  }
  return { ...groups, byUid, memberships };
}

async function wipe({ junk, protected: keep, byUid, memberships }) {
  const keepIds = new Set(keep.map(k => k.id));
  for (const k of junk) {
    if (!DRY) await db.recursiveDelete(k.ref);
    for (const c of ['profiles', 'standings', 'seen', 'pollSlots', 'battleSlots']) if (!DRY) await db.recursiveDelete(db.collection(c).doc(k.id));
    for (const m of memberships.filter(m => m.kid === k.id)) if (!DRY) await m.ref.delete();
    for (const uid of k.uids) {
      const email = byUid.get(uid)?.email || '';
      if (email.endsWith('@kitchen.test') && !DRY) await auth.deleteUser(uid);
    }
    for (const c of ['invites', 'residentLinks']) await deleteQuery(db.collection(c).where('kitchenId', '==', k.id));
  }
  log(`deleted ${junk.length} junk kitchens: ${junk.map(k => k.name).join(', ')}`);
  // Kollegiet: everything a protected kitchen did not write or get.
  const mine = d => keepIds.has(d.get('kitchenId')) || keepIds.has(d.get('from')) || keepIds.has(d.get('to')) || keepIds.has(d.id);
  let n = 0;
  for (const c of ['posts', 'events', 'kudos', 'battles', 'polls', 'reports', 'standings', 'seen', 'pollSlots', 'battleSlots', 'hidden', 'archive']) {
    for (const d of (await db.collection(c).get()).docs) {
      if (mine(d)) continue;
      if (!DRY) await db.recursiveDelete(d.ref);
      n++;
    }
  }
  log(`deleted ${n} Kollegiet documents`);
}

// A kitchen's active residents and products, for purchases and dinners.
async function stock(k) {
  const users = (await k.ref.collection('users').get()).docs.filter(u => u.get('active') !== false && !u.get('movedOutAt') && !u.get('anonymisedAt'));
  const products = (await k.ref.collection('products').get()).docs.filter(p => p.get('active') !== false && Number(p.get('price')) > 0);
  return { users, products };
}

// From the newest purchase to now, at the kitchen's pace over the two months before it.
async function topUp(k, { users, products }) {
  if (!users.length || !products.length) return 0;
  const purchases = k.ref.collection('purchases');
  const newest = (await purchases.orderBy('timestamp', 'desc').limit(1).get()).docs[0];
  const last = newest ? newest.get('timestamp').toMillis() : now - 30 * D;
  const from = Math.max(last + M, now - 90 * D);
  const window = (await purchases.where('timestamp', '>=', T(last - 60 * D)).where('timestamp', '<', T(last)).count().get()).data().count;
  const perDay = Math.max(4, Math.round(window / 60));
  const weights = products.map(p => Math.max(1, Number(p.get('sold')) || 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const product = () => { let r = rnd() * total; for (let i = 0; i < products.length; i++) if ((r -= weights[i]) < 0) return products[i]; return products[0]; };
  const writer = DRY ? null : db.bulkWriter();
  let n = 0;
  for (let day = new Date(from); day.getTime() < now; day.setDate(day.getDate() + 1)) {
    const weekend = [5, 6].includes(day.getDay());
    const count = Math.round(perDay * (weekend ? 1.5 : 1) * (0.6 + rnd() * 0.8));
    for (let i = 0; i < count; i++) {
      const hour = pick([12, 15, 17, 18, 19, 20, 20, 21, 21, 22, 22, 23, 23, 0, 1]);
      const t = new Date(day); t.setHours(hour, between(0, 59), between(0, 59), 0);
      if (t.getTime() < from || t.getTime() >= now - M) continue;
      const p = product(), u = pick(users), amount = rnd() < 0.85 ? 1 : between(2, 3);
      writer?.create(purchases.doc(), { productId: p.id, productName: p.get('name'), amount, price: Math.round(Number(p.get('price')) * amount * 100) / 100,
        userId: u.id, userName: u.get('name'), userRoom: u.get('room') ?? null, timestamp: T(t.getTime()) });
      n++;
    }
  }
  await writer?.close();
  return n;
}

// The expenses split the way the app does it (src/app/interfaces/meal.ts, splitExpenses).
function splitExpenses(expenses, eaters) {
  const paid = new Map();
  for (const e of expenses) paid.set(e.by, (paid.get(e.by) || 0) + Math.round(e.kr * 100));
  const ore = [...paid.values()].reduce((a, b) => a + b, 0), base = Math.floor(ore / eaters.length), rest = ore - base * eaters.length;
  const lines = eaters.map((userId, i) => ({ userId, amount: 1, ore: base + (i < rest ? 1 : 0) }));
  for (const [by, kr] of paid) {
    const line = lines.find(l => l.userId === by);
    if (line) line.ore -= kr; else lines.push({ userId: by, amount: 0, ore: -kr });
  }
  return lines.map(l => ({ ...l, price: l.ore / 100 }));
}

async function foodClub(k, { users }) {
  if (users.length < 4) return 0;
  const meals = k.ref.collection('meals');
  const purchases = k.ref.collection('purchases');
  const firstDay = dayKey(new Date(now - 45 * D));
  await deleteQuery(meals.where('__name__', '>=', firstDay));
  await deleteQuery(purchases.where('productId', '>=', 'madklub-').where('productId', '<', 'madklub.'));
  const byId = new Map(users.map(u => [u.id, u]));
  let n = 0;
  const dinner = async (date, past) => {
    const [menu, tags] = pick(MENUS);
    const people = shuffle(users);
    const cooks = people.slice(0, rnd() < 0.2 ? 2 : 1).map(u => u.id);
    const signups = [...new Set([...cooks, ...people.slice(2, 2 + between(past ? 3 : 1, past ? 8 : 5)).map(u => u.id)])];
    const id = dayKey(date);
    const meal = { day: id, date: T(date.getTime()), closesAt: T(date.getTime() - 24 * H), cooks, menu, notes: '', tags, askCook: false, signups,
      createdAt: T(date.getTime() - between(3, 10) * D) };
    // What was bought: the cook's shopping, sometimes a second resident's too (the wine), added days
    // before or on the day; most dinners eaten are split, and some ahead already have shopping in.
    if (past || rnd() < 0.4) {
      meal.expenses = [{ id: `e${between(1000, 9999)}`, by: cooks[0], kr: Math.round(between(120, 420) * 2) / 2, note: pick(['Netto', 'Rema', 'Føtex', '']),
        at: T(Math.min(date.getTime() - between(0, 3) * D, now - H)) }];
      if (rnd() < 0.3) {
        meal.expenses.push({ id: `e${between(1000, 9999)}`, by: pick(signups), kr: between(40, 120), note: pick(['Vin', 'Dessert', '']),
          at: T(Math.min(date.getTime() - between(0, 2) * D, now - H)) });
      }
    }
    if (past && rnd() < 0.7) {
      const total = Math.round(meal.expenses.reduce((n, e) => n + Math.round(e.kr * 100), 0)) / 100;
      const productId = `madklub-${id}`;
      const lines = splitExpenses(meal.expenses, signups);
      for (const l of lines) {
        const u = byId.get(l.userId);
        if (!DRY) await purchases.add({ productId, productName: 'Madklub', amount: l.amount, price: l.price, userId: l.userId,
          userName: u.get('name'), userRoom: u.get('room') ?? null, timestamp: T(Math.min(date.getTime() + 2 * H, now - M)) });
      }
      meal.bill = { productId, total, paidBy: cooks[0], eaters: signups.length, share: Math.floor(Math.round(total * 100) / signups.length) / 100,
        at: T(Math.min(date.getTime() + 2 * H, now - M)) };
    }
    if (!DRY) await meals.doc(id).set(meal);
    n++;
  };
  for (let week = 6; week >= 0; week--) {
    for (const weekday of shuffle([1, 2, 3, 4]).slice(0, 2)) {
      const date = new Date(now - week * 7 * D);
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + weekday - 1);
      date.setHours(18, 30, 0, 0);
      if (date.getTime() < now - 45 * D || date.getTime() > now) continue;
      await dinner(date, true);
    }
  }
  for (const days of shuffle([2, 3, 5, 8, 10, 12]).slice(0, 3)) {
    const date = new Date(now + days * D); date.setHours(18, 30, 0, 0);
    await dinner(date, false);
  }
  return n;
}

// Last month half paid, one of them for an amount that has changed since.
async function accounting(k) {
  const first = new Date(now); first.setDate(1); first.setHours(0, 0, 0, 0);
  const from = new Date(first); from.setMonth(from.getMonth() - 1);
  const to = new Date(first); to.setDate(0);
  const list = await k.ref.collection('purchases').where('timestamp', '>=', T(from.getTime())).where('timestamp', '<', T(first.getTime())).get();
  const totals = {};
  for (const p of list.docs) totals[p.get('userId')] = (totals[p.get('userId')] || 0) + (Number(p.get('price')) || 0);
  const paid = {};
  const owing = Object.entries(totals).filter(([, kr]) => Math.abs(kr) >= 0.005);
  owing.filter(() => rnd() < 0.55).forEach(([uid, kr], i) => {
    paid[uid] = { kr: Math.round(kr * 100) / 100 + (i === 0 ? 12.5 : 0), at: T(first.getTime() + between(1, 3) * D) };
  });
  if (DRY) return Object.keys(paid).length;
  await k.ref.collection('settings').doc('accounting').set({ mobilePay: String(between(20000000, 99999999)) });
  await k.ref.collection('settlements').doc(`${dayKey(from)}_${dayKey(to)}`).set({ from: dayKey(from), to: dayKey(to), paid });
  return Object.keys(paid).length;
}

async function kollegiet(kitchens, home) {
  const ids = kitchens.map(k => k.id);
  const name = Object.fromEntries(kitchens.map(k => [k.id, k.name]));
  const others = kid => ids.filter(i => i !== kid);
  const set = (path, data) => DRY ? null : db.doc(path).set(data);

  for (const k of kitchens) {
    const [emoji, colour, bio, lends] = PROFILES[k.name] || ['🏠', 'grey', 'Vores køkken.', []];
    await set(`profiles/${k.id}`, { emoji, colour, bio, lends, updatedAt: T(now - between(2, 20) * D) });
  }

  // Notes: one to three a kitchen, half with replies, and two borrow questions with answers.
  let notes = 0, noteNo = 0;
  const post = (kitchenId, text, ms, extra = {}) => set(`posts/staging-post-${++noteNo}`, { kitchenId, text, to: null, parentId: null, createdAt: T(ms), ...extra });
  const borrowers = shuffle(ids).slice(0, 2);
  for (const kid of ids) {
    const count = borrowers.includes(kid) ? between(1, 2) : between(1, 3);
    for (let i = 0; i < count; i++) {
      const ms = now - between(1, 20 * 24) * H;
      await post(kid, pick(NOTES), ms);
      notes++;
      const parent = `staging-post-${noteNo}`;
      if (rnd() < 0.5) {
        let t = ms;
        for (const from of shuffle(others(kid)).slice(0, between(1, 4))) {
          t = Math.min(now - M, t + between(10, 300) * M);
          await post(from, pick(REPLIES), t, { parentId: parent });
        }
      }
    }
    if (borrowers.includes(kid)) {
      const lender = pick(others(kid).filter(o => PROFILES[name[o]]?.[3]?.length));
      const item = pick(PROFILES[name[lender]][3]);
      const ms = now - between(2, 60) * H;
      await post(kid, `Hej! Må vi låne jeres ${item.charAt(0).toLowerCase() + item.slice(1)}?`, ms, { to: lender });
      notes++;
      await post(lender, 'Selvfølgelig, kom forbi og hent den.', Math.min(now - M, ms + 40 * M), { parentId: `staging-post-${noteNo}` });
    }
  }

  // Events: three last week, four ahead, one of them over a weekend.
  let eventNo = 0;
  const event = (kitchenId, kind, title, startsAt, hours, invited, extra = {}) => set(`events/staging-event-${++eventNo}`, {
    kitchenId, kind, title, text: '', place: '', startsAt: T(startsAt), endsAt: T(startsAt + hours * H), invited, rsvp: {}, createdAt: T(startsAt - 3 * D), ...extra });
  const rsvp = kid => Object.fromEntries(shuffle(others(kid)).slice(0, between(2, 5)).map(o => [o, pick(['yes', 'yes', 'maybe', 'no'])]));
  const [e1, e2, e3, e4, e5, e6] = shuffle(ids);
  await event(e1, 'openKitchen', 'Åbent køkken', at(6, 21), 5, 'all', { rsvp: rsvp(e1), place: name[e1] });
  await event(e2, 'party', 'Halloween-fest', at(4, 22), 6, 'all', { rsvp: rsvp(e2), text: 'Udklædning påkrævet.' });
  await event(e3, 'dinner', 'Fællesspisning: chili', at(2, 18), 3, 'all', { rsvp: rsvp(e3) });
  await event(e4, 'openKitchen', 'Åbent køkken med ny højtaler', at(0, 21), 5, 'all', { rsvp: rsvp(e4), place: name[e4], text: 'Alle er velkomne. Vi har chips.', createdAt: T(now - 5 * H) });
  const friday = new Date(now); friday.setDate(friday.getDate() + ((5 - friday.getDay() + 7) % 7 || 7)); friday.setHours(20, 0, 0, 0);
  await event(e5, 'party', 'Weekend-fest', friday.getTime(), 48, 'all', { rsvp: rsvp(e5), place: 'Slyngenstuen', text: 'Hele weekenden. Kom og gå som I vil.' });
  await event(home, 'dinner', 'Plantebaseret fællesspisning', at(-4, 18), 3, 'all', { rsvp: rsvp(home), place: 'Mellemste 7' });
  await event(e6, 'party', 'Discofest', at(-9, 22), 6, shuffle(others(e6)).slice(0, 3), { text: 'Tema: 80erne.' });

  // Battles: won over two months (with standings), a live one, the food club month and a challenge.
  const wins = {}, titles = {};
  const metrics = [['beer', 'Fredagsøl'], ['drinks', 'Weekendens tørstigste'], ['mealDiners', 'Madklub-ugen'], ['gym', 'Fitness-ugen'], ['beer', 'Ølstafet'], ['drinks', 'Tirsdagsdrikke'],
    ['plantMeals', 'Grøn uge'], ['mealDiners', 'Flest til middag']];
  for (const [i, [metric, title]] of metrics.entries()) {
    const end = at(3 + i * 7, 23), start = end - between(1, 5) * D;
    const participants = shuffle(ids).slice(0, between(2, 5));
    const scores = Object.fromEntries(participants.map(p => [p, metric === 'plantMeals' ? between(10, 90) : between(3, 60)]));
    const top = Math.max(...Object.values(scores));
    const winners = participants.filter(p => scores[p] === top);
    winners.forEach(w => wins[w] = (wins[w] || 0) + 1);
    const ref = `battles/staging-battle-${i + 1}`;
    await set(ref, { kitchenId: participants[0], title, metric, from: T(start), to: T(end), invited: 'all', participants, createdAt: T(start - D),
      result: { scores, winners, settledAt: T(end + H) } });
    for (const p of participants) await set(`${ref}/tally/${p}`, { value: scores[p], ticks: [], updatedAt: T(end) });
  }
  const liveIn = shuffle(ids.filter(i => i !== home)).slice(0, 3).concat(home);
  const liveFrom = now - 2 * H, tonight = new Date(now); tonight.setHours(26, 0, 0, 0);
  await set('battles/staging-battle-live', { kitchenId: liveIn[0], title: 'Fredagsøl: alle mod alle', metric: 'beer', from: T(liveFrom), to: T(tonight.getTime()),
    invited: 'all', participants: liveIn, createdAt: T(now - 6 * H) });
  for (const p of liveIn) {
    const ticks = Array.from({ length: between(2, 5) }, () => ({ at: T(now - between(5, 110) * M), n: between(2, 8) })).sort((a, b) => a.at.toMillis() - b.at.toMillis());
    await set(`battles/staging-battle-live/tally/${p}`, { value: p === home ? 0 : ticks.reduce((n, t) => n + t.n, 0), ticks: p === home ? [] : ticks, updatedAt: T(now - M) });
  }
  const month = new Date(now); month.setDate(1); month.setHours(0, 0, 0, 0);
  const next = new Date(month); next.setMonth(month.getMonth() + 1);
  const foodIn = shuffle(ids.filter(i => i !== home)).slice(0, 2).concat(home);
  await set('battles/staging-battle-food', { kitchenId: foodIn[0], title: 'Madklub-måneden', metric: 'mealDiners', from: T(month.getTime()), to: T(next.getTime()),
    invited: 'all', participants: foodIn, createdAt: T(month.getTime() - D) });
  for (const p of foodIn) await set(`battles/staging-battle-food/tally/${p}`, { value: between(4, 20), ticks: [], updatedAt: T(now - H) });
  const challenger = pick(ids.filter(i => i !== home));
  await set('battles/staging-battle-challenge', { kitchenId: challenger, title: 'Lørdagsøl: kom an', metric: 'drinks', from: T(now + H), to: T(now + 14 * H),
    invited: [home], participants: [challenger], createdAt: T(now - 30 * M) });

  // Votes: two last month, one this month (counted), one open.
  const polls = [['Hyggeligste køkken', 35], ['Bedste fest', 28], ['Største arme', 2]];
  for (const [i, [title, daysAgo]] of polls.entries()) {
    const kid = pick(ids);
    const ballots = shuffle(others(kid)).slice(0, between(3, 7)).map(from => [from, pick(others(from))]);
    const votes = {};
    ballots.forEach(([, c]) => votes[c] = (votes[c] || 0) + 1);
    const top = Math.max(...Object.values(votes));
    const winners = Object.keys(votes).filter(c => votes[c] === top);
    winners.forEach(w => (titles[w] ||= []).push(title));
    const ref = `polls/staging-poll-${i + 1}`;
    await set(ref, { kitchenId: kid, title, opensAt: T(now - (daysAgo + 7) * D), closesAt: T(now - daysAgo * D), createdAt: T(now - (daysAgo + 7) * D),
      result: { votes, winners, settledAt: T(now - daysAgo * D + H) } });
    for (const [from, choice] of ballots) await set(`${ref}/ballots/${from}`, { choice, at: T(now - (daysAgo + 2) * D) });
  }
  const opener = pick(ids.filter(i => i !== home));
  await set('polls/staging-poll-open', { kitchenId: opener, title: 'Bedst til genbrug denne måned', opensAt: T(now - D), closesAt: T(now + 6 * D), createdAt: T(now - D) });
  for (const from of shuffle(others(opener).filter(i => i !== home)).slice(0, 3)) await set(`polls/staging-poll-open/ballots/${from}`, { choice: pick(others(from)), at: T(now - 5 * H) });

  for (const kid of ids) {
    if (wins[kid] || titles[kid]) await set(`standings/${kid}`, { wins: wins[kid] || 0, titles: titles[kid] || [], updatedAt: T(now) });
  }

  // High-fives and badges over eight weeks.
  let kudos = 0;
  for (let i = 0; i < 70; i++) {
    const from = pick(ids), to = pick(others(from)), ms = now - between(1, 56 * 24) * H - between(0, 59) * M;
    if (rnd() < 0.62) {
      await set(`kudos/${from}_${to}_${dayKey(new Date(ms))}`, { from, to, kind: 'highfive', badge: null, reason: '', createdAt: T(ms) });
    } else {
      const badge = pick(Object.keys(REASONS));
      await set(`kudos/staging-kudos-${i}`, { from, to, kind: 'badge', badge, reason: pick(REASONS[badge]), createdAt: T(ms) });
    }
    kudos++;
  }
  await set(`seen/${home}`, { kollegietAt: T(now - 2 * D) });
  log(`kollegiet: ${kitchens.length} profiles, ${notes} notes, ${eventNo} events, ${metrics.length + 3} battles, ${polls.length + 1} votes, ${kudos} kudos`);
}

(async () => {
  const groups = await classify();
  log(`protected (untouched): ${groups.protected.map(k => k.name).join(', ') || '-'}`);
  log(`staging: ${groups.staging.map(k => `${k.name} (${k.purchases})`).join(', ')}`);
  log(`junk: ${groups.junk.map(k => `${k.name} (${k.purchases})`).join(', ') || '-'}`);
  if (DRY) log('(dry run: nothing written)');
  if (args.wipe) await wipe(groups);
  const home = groups.staging.find(k => k.id === HOME);
  if (!home) throw new Error(`No ${HOME} on ${projectId}`);
  for (const k of groups.staging) {
    const s = await stock(k);
    const bought = await topUp(k, s);
    const dinners = await foodClub(k, s);
    const paid = await accounting(k);
    log(`${k.name}: ${bought} purchases added, ${dinners} dinners, ${paid} marked paid for last month`);
  }
  await kollegiet(groups.staging, HOME);
  log('Then: node league.js --project dev --daily; node backup.js --project dev --out ...; node stats-summary.js --project dev --from ...');
})().catch(e => { console.error(e); process.exit(1); });
