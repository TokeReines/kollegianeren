#!/usr/bin/env node
// Test data for Kollegiet (docs/kollegiet.md) around one home kitchen: a case for every feature.
//
// - Toke: an unread message for the home kitchen (the strip under the top bar).
// - Profiles for every kitchen, and categories on the products (the beer battle).
// - Board: posts with replies, a post for the home kitchen, an event for everyone tonight, a party
//   the home kitchen is invited to, the home kitchen's own dinner.
// - Battles: a live beer battle with bursts, a challenge for the home kitchen to join, a food club
//   battle for everyone, a gym battle starting tomorrow, and one that ended (for ops/league.js).
// - Kudos: a high-five and a badge for the home kitchen, badges between the others.
// - Polls: an open secret poll the home kitchen has not voted in, a closed one for ops/league.js.
// - The home kitchen last looked three hours ago, so its screens have things waiting.
//
//   node seed-kollegiet.js                                   # emulators: home Ny2, rivals from the prod copy
//   node seed-kollegiet.js --project dev --kitchen <id>      # dev: home <id>, four test rival kitchens
//   node seed-kollegiet.js --project dev --kitchen <id> --remove
//
// Re-runnable: it replaces its own documents (ids starting seed-, kitchens test-rival-…). On dev
// it writes no purchases, residents or products into the home kitchen; the rivals get their own.
// Refuses prod. Then: node league.js (--emulator | --project dev) --daily
const { parseArgs } = require('./lib/firebase');
const { Timestamp } = require('firebase-admin/firestore');
const { suggest } = require('./suggest-categories');

const args = parseArgs();
const now = Date.now();
const M = 60e3, H = 3600e3, D = 864e5;
const T = ms => Timestamp.fromMillis(ms);
const tonight = h => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };
const emulator = !args.project;
let db;

if (emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8181';
  if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error('Emulator only without --project');
  db = require('firebase-admin/firestore').getFirestore(require('firebase-admin/app').initializeApp({ projectId: 'demo-kollegianeren' }));
} else {
  const init = require('./lib/firebase').init(args.project);
  if (init.projectId === 'firebase-ehp') throw new Error('Not on prod');
  if (!args.kitchen) throw new Error('--kitchen <id>: the home kitchen');
  db = init.db;
}

// The rival kitchens on dev: made up, with a few products and residents of their own.
const RIVALS = [
  { id: 'test-rival-1', name: 'Test Ny2', emoji: '🐙', colour: 'teal', bio: 'Testkøkken: tavlens bedste udsigt og den mest larmende kaffemaskine.' },
  { id: 'test-rival-2', name: 'Test Gl4', emoji: '🔥', colour: 'red', bio: 'Testkøkken: åbent køkken hver fredag.' },
  { id: 'test-rival-3', name: 'Test Ny6', emoji: '🎉', colour: 'purple', bio: 'Testkøkken: festkøkkenet med discokugle.' },
  { id: 'test-rival-4', name: 'Test Ml8', emoji: '🏋️', colour: 'green', bio: 'Testkøkken: halvdelen er i fitness, resten i sofaen.' },
];
const RIVAL_PRODUCTS = [['Classic Tuborg', 7, 'beer'], ['Grøn Tuborg', 7, 'beer'], ['Faxe Kondi', 6, 'soda'], ['Danskvand', 5, 'water']];
// On the emulators: kitchens from the anonymised prod copy, by name.
const EMULATOR = { home: 'Ny2', a: 'Gl4', b: 'Ny6', c: 'Ml8', d: 'Mellemste 7', e: 'Gl7', f: 'Ny3' };
const EMULATOR_PROFILES = {
  Ny2: ['🐙', 'teal', 'Vi har tavlens bedste udsigt og den mest larmende kaffemaskine.'],
  Gl4: ['🔥', 'red', 'Åbent køkken hver fredag. Medbring godt humør.'],
  Ny6: ['🎉', 'purple', 'Festkøkkenet på Ny. Vi har en discokugle.'],
  Ml8: ['🏋️', 'green', 'Halvdelen af os er i fitness, resten er i sofaen.'],
  'Mellemste 7': ['🌻', 'amber', 'Plantebaseret madklub tre gange om ugen.'],
  Gl7: ['🦊', 'orange', 'Små men seje.'],
  Ny3: ['🍕', 'blue', 'Pizza søndag, altid.'],
};

async function clear() {
  for (const c of ['posts', 'events', 'battles', 'kudos', 'polls', 'reports']) {
    const docs = await db.collection(c).where('__name__', '>=', 'seed-').where('__name__', '<', 'seed.').get();
    for (const d of docs.docs) await db.recursiveDelete(d.ref);
  }
  // What ops/league.js wrote on earlier runs.
  for (const c of ['posts', 'reports']) {
    for (const d of (await db.collection(c).where('kitchenId', '==', 'kollegiet').get()).docs) await d.ref.delete();
  }
}

// The home kitchen and six others: on dev the four test rivals stand in for all six.
async function kitchens() {
  if (emulator) {
    const byName = new Map((await db.collection('kitchens').get()).docs.map(d => [d.get('name'), d.id]));
    const out = {};
    for (const [role, name] of Object.entries(EMULATOR)) {
      if (!byName.has(name)) throw new Error(`No kitchen ${name}: run restore.js --anonymise and seed-demo.js first`);
      out[role] = byName.get(name);
    }
    for (const [name, [emoji, colour, bio]] of Object.entries(EMULATOR_PROFILES)) {
      await db.collection('profiles').doc(byName.get(name)).set({ emoji, colour, bio, updatedAt: T(now - 2 * D) });
    }
    return out;
  }
  const home = await db.collection('kitchens').doc(args.kitchen).get();
  if (!home.exists) throw new Error(`No kitchen ${args.kitchen} on ${args.project}`);
  if (!(await db.collection('profiles').doc(home.id).get()).exists) {
    await db.collection('profiles').doc(home.id).set({ emoji: '🏠', colour: 'blue', bio: 'Vores køkken.', updatedAt: T(now - 2 * D) });
  }
  for (const r of RIVALS) {
    const ref = db.collection('kitchens').doc(r.id);
    await ref.set({ id: r.id, name: r.name });
    await db.collection('profiles').doc(r.id).set({ emoji: r.emoji, colour: r.colour, bio: r.bio, updatedAt: T(now - 2 * D) });
    for (const [i, [name, price, category]] of RIVAL_PRODUCTS.entries()) {
      await ref.collection('products').doc(`seed-p${i}`).set({ name, price, retailPrice: null, image: '', clId: '', active: true, category, sold: 0 });
    }
    for (let i = 1; i <= 3; i++) {
      await ref.collection('users').doc(`seed-u${i}`).set({ name: `Testbeboer ${i}`, room: `${r.id.slice(-1)}0${i}`, kitchen: r.id, active: true });
    }
    for (const old of (await ref.collection('purchases').get()).docs) await old.ref.delete();
  }
  const [a, b, c, d] = RIVALS.map(r => r.id);
  return { home: home.id, a, b, c, d, e: a, f: b };
}

// A kitchen's beer count in a window, from its real purchases (what ops/league.js will check).
async function realDrinks(kid, from, to) {
  const s = await db.collection('kitchens').doc(kid).collection('purchases').where('timestamp', '>=', T(from)).where('timestamp', '<', T(to)).get();
  return s.docs.reduce((n, p) => n + (Number(p.get('amount')) || 0), 0);
}

// Purchases in a rival kitchen, so its tally and the real number agree (cleared in kitchens()).
async function rivalPurchases(kid, count, from, span) {
  const ref = db.collection('kitchens').doc(kid).collection('purchases');
  for (let i = 0; i < count; i++) {
    await ref.doc(`seed-${from}-${i}`).set({
      productId: 'seed-p0', productName: 'Classic Tuborg', amount: 1, price: 7,
      userId: `seed-u${1 + (i % 3)}`, userName: `Testbeboer ${1 + (i % 3)}`, userRoom: '', timestamp: T(from + (i + 0.5) * span / count),
    });
  }
}

async function remove() {
  await clear();
  for (const r of RIVALS) {
    await db.recursiveDelete(db.collection('kitchens').doc(r.id));
    for (const c of ['profiles', 'standings', 'seen']) await db.recursiveDelete(db.collection(c).doc(r.id));
  }
  for (const c of ['standings', 'seen']) await db.recursiveDelete(db.collection(c).doc(args.kitchen));
  const messages = await db.collection('kitchens').doc(args.kitchen).collection('messages').where('__name__', '>=', 'seed-').where('__name__', '<', 'seed.').get();
  for (const d of messages.docs) await d.ref.delete();
  console.log('Kollegiet test data removed (the home kitchen profile and product categories stay).');
}

(async () => {
  if (args.remove) {
    if (emulator) throw new Error('--remove is for --project dev');
    return remove();
  }
  await clear();
  const k = await kitchens();
  const { home, a, b, c, d, e, f } = k;
  const everyone = [...new Set(Object.values(k))];
  for (const kid of everyone) await db.recursiveDelete(db.collection('standings').doc(kid));

  // Categories on products without one (the products dialog sets them by hand).
  for (const kid of everyone) {
    for (const p of (await db.collection('kitchens').doc(kid).collection('products').get()).docs) {
      if (!p.get('category')) await p.ref.update({ category: suggest(p.get('name')) });
    }
  }

  // A message from Toke, unread: the strip under the top bar.
  await db.collection('kitchens').doc(home).collection('messages').doc('seed-message').set({
    text: 'Hej! Kollegiet er åbent: skriv til de andre køkkener, udfordr dem til battles, og giv high-fives. Sig til, hvis noget driller.',
    from: 'maker', createdAt: T(now - 20 * M), seenByMaker: true, seenByKitchen: false,
  });

  const post = (n, kitchenId, text, at, extra = {}) =>
    db.collection('posts').doc(`seed-post-${n}`).set({ kitchenId, text, to: null, parentId: null, createdAt: T(at), ...extra });
  await post(1, a, 'Åbent køkken i aften fra kl. 21! Vi har fået en ny højtaler, kom og hør den. 🔊', now - 5 * H);
  await post(2, b, 'Er der nogen der har en raclette-grill vi kan låne til lørdag?', now - 4 * H);
  await post(3, home, 'Vi har! Kom forbi og hent den.', now - 3.5 * H, { parentId: 'seed-post-2' });
  await post(4, b, 'I er de bedste. 🙏', now - 3.4 * H, { parentId: 'seed-post-2' });
  await post(5, c, 'Fitness-battle denne uge? Vi tror ikke, nogen kan slå os. 💪', now - 2 * H, { to: home });
  await post(6, d, 'Plantebaseret madklub torsdag: linsegryde. Andre køkkener er velkomne, sig til i forvejen.', now - 40 * M);

  const event = (n, kitchenId, kind, title, startsAt, hours, invited, extra = {}) => db.collection('events').doc(`seed-event-${n}`).set({
    kitchenId, kind, title, text: '', place: '', startsAt: T(startsAt), endsAt: T(startsAt + hours * H), invited, rsvp: {}, createdAt: T(now - H), ...extra,
  });
  await event(1, a, 'openKitchen', 'Åbent køkken med ny højtaler', tonight(21), 5, 'all', { text: 'Alle er velkomne. Vi har chips.', rsvp: { [b]: 'yes', [c]: 'maybe' } });
  await event(2, b, 'party', 'Discofest', tonight(22) + 2 * D, 6, [home, c, a], { text: 'Tema: 80erne. Dresscode valgfri, men værdsat.', rsvp: { [a]: 'yes' } });
  await event(3, home, 'dinner', 'Fællesspisning: lasagne', tonight(18) + 5 * D, 3, 'all', { createdAt: T(now - 2 * D) });

  // A live beer battle with ticks, so the burst shows. The home kitchen is in it at 0: a sale of a
  // beer on its tablet moves it.
  const live = db.collection('battles').doc('seed-battle-live');
  const liveFrom = now - 2 * H;
  await live.set({ kitchenId: a, title: 'Fredagsøl: alle mod alle', metric: 'beer', from: T(liveFrom), to: T(tonight(26)),
    invited: 'all', participants: [...new Set([a, home, b, c])], createdAt: T(now - 6 * H) });
  const ticks = pattern => pattern.map(([minAgo, n]) => ({ at: T(now - minAgo * M), n }));
  const tallies = {
    [a]: [34, ticks([[95, 6], [70, 4], [40, 8], [12, 6], [3, 10]])],
    [b]: [41, ticks([[110, 12], [80, 6], [50, 6], [17, 8], [6, 9]])],
    [c]: [12, ticks([[90, 6], [45, 6]])],
  };
  for (const [kid, [value, t]] of Object.entries(tallies)) await live.collection('tally').doc(kid).set({ value, ticks: t, updatedAt: T(now - M) });
  await db.collection('standings').doc(a).collection('achievements').doc('firstBattle').set({ battle: live.id, at: T(now - 90 * M) });
  await db.collection('standings').doc(b).collection('achievements').doc('firstBattle').set({ battle: live.id, at: T(now - 100 * M) });

  // A challenge for the home kitchen, starting in an hour: join it from the strip.
  await db.collection('battles').doc('seed-battle-challenge').set({ kitchenId: b, title: 'Lørdagsøl: kom an', metric: 'drinks',
    from: T(now + H), to: T(now + 14 * H), invited: [home], participants: [b], createdAt: T(now - 30 * M) });
  // A gym battle from tomorrow, invited too, and a food club battle for everyone this month.
  await db.collection('battles').doc('seed-battle-gym').set({ kitchenId: c, title: 'Fitness-ugen', metric: 'gym', from: T(tonight(6) + D),
    to: T(tonight(23) + 7 * D), invited: [home, a], participants: [c], createdAt: T(now - 2 * H) });
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const nextMonth = new Date(month); nextMonth.setMonth(month.getMonth() + 1);
  await db.collection('battles').doc('seed-battle-food').set({ kitchenId: f, title: 'Madklub-måneden', metric: 'mealDiners',
    from: T(month.getTime()), to: T(nextMonth.getTime()), invited: 'all', participants: [...new Set([f, d])], createdAt: T(now - 3 * D) });

  // Ended yesterday, for ops/league.js: the home kitchen's real drinks against a rival's.
  const ended = db.collection('battles').doc('seed-battle-ended');
  const endFrom = now - 30 * H, endTo = now - 20 * H;
  await ended.set({ kitchenId: e, title: 'Tirsdagsdrikke', metric: 'drinks', from: T(endFrom), to: T(endTo),
    invited: 'all', participants: [...new Set([e, home])], createdAt: T(now - 2 * D) });
  const homeDrinks = await realDrinks(home, endFrom, endTo);
  const rivalDrinks = emulator ? 9 : Math.max(3, homeDrinks - 2);
  if (emulator) {
    // The prod copy has no purchases in the window: give both some.
    for (const [kid, n] of [[e, rivalDrinks], [home, 14]]) {
      const ref = db.collection('kitchens').doc(kid);
      const [product] = (await ref.collection('products').where('active', '==', true).limit(1).get()).docs;
      const [user] = (await ref.collection('users').where('active', '==', true).limit(1).get()).docs;
      for (const old of (await ref.collection('purchases').where('__name__', '>=', 'seed-').where('__name__', '<', 'seed.').get()).docs) await old.ref.delete();
      for (let i = 0; i < n; i++) {
        await ref.collection('purchases').doc(`seed-battle-${i}`).set({ productId: product.id, productName: product.get('name'), amount: 1,
          price: product.get('price') || 0, userId: user.id, userName: user.get('name'), userRoom: user.get('room') || '', timestamp: T(endFrom + (i + 1) * 30 * M) });
      }
      await ended.collection('tally').doc(kid).set({ value: n, ticks: [], updatedAt: T(endTo - H) });
    }
  } else {
    await rivalPurchases(e, rivalDrinks, endFrom, endTo - endFrom);
    await ended.collection('tally').doc(e).set({ value: rivalDrinks, ticks: [], updatedAt: T(endTo - H) });
    await ended.collection('tally').doc(home).set({ value: homeDrinks, ticks: [], updatedAt: T(endTo - H) });
    // The rivals' beers in the live battle are real purchases too, for when it is settled tonight.
    for (const [kid, [value]] of Object.entries(tallies)) await rivalPurchases(kid, value, liveFrom, now - liveFrom - M);
  }

  const kudos = (docId, from, to, kind, badge, reason, at) => db.collection('kudos').doc(docId).set({ from, to, kind, badge, reason, createdAt: T(at) });
  await kudos(`${a}_${home}_${new Date(now - 50 * M).toISOString().slice(0, 10)}`, a, home, 'highfive', null, '', now - 50 * M);
  await kudos('seed-kudos-1', b, home, 'badge', 'goodFriends', 'Lånte os jeres raclette-grill', now - 3 * H);
  await kudos('seed-kudos-2', c, a, 'badge', 'bestParty', 'Fredagens åbne køkken var vildt', now - 26 * H);
  await kudos('seed-kudos-3', home, d, 'badge', 'plantBased', 'Den bedste linsegryde i Egmont', now - 2 * D);
  await kudos('seed-kudos-4', e, b, 'badge', 'loud', 'Vi kunne høre jer fra Gl', now - 3 * D);

  // An open poll the home kitchen has not voted in, and one that closed, for ops/league.js.
  const open = db.collection('polls').doc(`seed-${e}-open`);
  await open.set({ kitchenId: e, title: 'Bedst til genbrug denne måned', opensAt: T(now - D), closesAt: T(now + 6 * D), createdAt: T(now - D) });
  for (const [from, choice] of [[a, d], [b, d], [c, e]]) if (from !== choice) await open.collection('ballots').doc(from).set({ choice, at: T(now - 5 * H) });
  const closed = db.collection('polls').doc(`seed-${b}-closed`);
  await closed.set({ kitchenId: b, title: 'Hyggeligste køkken, sidste måned', opensAt: T(now - 8 * D), closesAt: T(now - H), createdAt: T(now - 8 * D) });
  for (const [from, choice] of [[a, home], [c, home], [d, a], [e, home]]) if (from !== choice) await closed.collection('ballots').doc(from).set({ choice, at: T(now - 3 * D) });

  await db.collection('seen').doc(home).set({ kollegietAt: T(now - 3 * H) });
  console.log(`Kollegiet test data written around ${home}. Then: node league.js ${emulator ? '--emulator' : '--project ' + args.project} --daily`);
})().catch(e => { console.error(e.message); process.exit(1); });
