#!/usr/bin/env node
// Demo data for Kollegiet (docs/kollegiet.md) on the local emulators, on top of seed-demo.js:
// profiles, product categories, posts with replies, events, a live beer battle with ticks, a gym
// challenge for Ny2, an ended battle and a closed poll for ops/league.js to settle, kudos and an
// open (secret) poll. Ny2 last looked three hours ago, so its tablet has things waiting.
// Emulator only; re-runnable (it replaces its own documents).
//
//   node seed-kollegiet.js
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8181';
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { suggest } = require('./suggest-categories');

if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error('Emulator only');
const db = getFirestore(initializeApp({ projectId: 'demo-kollegianeren' }));
const now = Date.now();
const M = 60e3, H = 3600e3, D = 864e5;
const T = ms => Timestamp.fromMillis(ms);
const tonight = h => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };

const PROFILES = {
  Ny2: ['🐙', 'teal', 'Vi har tavlens bedste udsigt og den mest larmende kaffemaskine.'],
  Gl4: ['🔥', 'red', 'Åbent køkken hver fredag. Medbring godt humør.'],
  Ny6: ['🎉', 'purple', 'Festkøkkenet på Ny. Vi har en discokugle.'],
  Ml8: ['🏋️', 'green', 'Halvdelen af os er i fitness, resten er i sofaen.'],
  'Mellemste 7': ['🌻', 'amber', 'Plantebaseret madklub tre gange om ugen.'],
  Gl7: ['🦊', 'orange', 'Små men seje.'],
  Ny3: ['🍕', 'blue', 'Pizza søndag, altid.'],
};

async function clear(collection) {
  const docs = await db.collection(collection).where('__name__', '>=', 'seed-').where('__name__', '<', 'seed.').get();
  for (const d of docs.docs) await db.recursiveDelete(d.ref);
}

(async () => {
  const kitchens = new Map((await db.collection('kitchens').get()).docs.map(d => [d.get('name'), d.id]));
  const id = name => {
    if (!kitchens.has(name)) throw new Error(`No kitchen ${name}: run restore.js --anonymise and seed-demo.js first`);
    return kitchens.get(name);
  };
  const [ny2, gl4, ny6, ml8, m7, gl7, ny3] = ['Ny2', 'Gl4', 'Ny6', 'Ml8', 'Mellemste 7', 'Gl7', 'Ny3'].map(id);

  for (const c of ['posts', 'events', 'battles', 'kudos', 'polls', 'reports']) await clear(c);
  // What ops/league.js wrote on earlier runs.
  for (const c of ['posts', 'reports']) {
    for (const d of (await db.collection(c).where('kitchenId', '==', 'kollegiet').get()).docs) await d.ref.delete();
  }
  for (const k of [ny2, gl4, ny6, ml8, m7, gl7, ny3]) await db.recursiveDelete(db.collection('standings').doc(k));

  // Profiles, and categories on every product (what the products dialog would set).
  for (const [name, [emoji, colour, bio]] of Object.entries(PROFILES)) {
    await db.collection('profiles').doc(id(name)).set({ emoji, colour, bio, updatedAt: T(now - 2 * D) });
  }
  for (const k of [ny2, gl4, ny6, ml8, m7, gl7, ny3]) {
    const products = await db.collection('kitchens').doc(k).collection('products').get();
    for (const p of products.docs) await p.ref.update({ category: suggest(p.get('name')) });
  }

  const post = (n, kitchenId, text, at, extra = {}) =>
    db.collection('posts').doc(`seed-post-${n}`).set({ kitchenId, text, to: null, parentId: null, createdAt: T(at), ...extra });
  await post(1, gl4, 'Åbent køkken i aften fra kl. 21! Vi har fået en ny højtaler, kom og hør den. 🔊', now - 5 * H);
  await post(2, ny6, 'Er der nogen der har en raclette-grill vi kan låne til lørdag?', now - 4 * H);
  await post(3, ny2, 'Vi har! Kom forbi og hent den.', now - 3.5 * H, { parentId: 'seed-post-2' });
  await post(4, ny6, 'I er de bedste. 🙏', now - 3.4 * H, { parentId: 'seed-post-2' });
  await post(5, ml8, 'Fitness-battle denne uge? Vi tror ikke, nogen kan slå os. 💪', now - 2 * H, { to: ny2 });
  await post(6, m7, 'Plantebaseret madklub torsdag: linsegryde. Andre køkkener er velkomne, sig til i forvejen.', now - 40 * M);

  const event = (n, kitchenId, kind, title, startsAt, hours, invited, extra = {}) => db.collection('events').doc(`seed-event-${n}`).set({
    kitchenId, kind, title, text: '', place: '', startsAt: T(startsAt), endsAt: T(startsAt + hours * H), invited, rsvp: {}, createdAt: T(now - H), ...extra,
  });
  await event(1, gl4, 'openKitchen', 'Åbent køkken med ny højtaler', tonight(21), 5, 'all',
    { place: 'Gl4', text: 'Alle er velkomne. Vi har chips.', rsvp: { [ny6]: 'yes', [ml8]: 'maybe' } });
  await event(2, ny6, 'party', 'Discofest på Ny6', tonight(22) + 2 * D, 6, [ny2, ml8, gl4],
    { place: 'Ny6', text: 'Tema: 80erne. Dresscode valgfri, men værdsat.', rsvp: { [gl4]: 'yes' } });
  await event(3, ny2, 'dinner', 'Fællesspisning: lasagne', tonight(18) + 5 * D, 3, 'all', { place: 'Ny2', createdAt: T(now - 2 * D) });

  // A live beer battle with ticks, so the burst shows.
  const live = db.collection('battles').doc('seed-battle-live');
  await live.set({ kitchenId: gl4, title: 'Fredagsøl: Gl4 mod resten', metric: 'beer', from: T(now - 2 * H), to: T(tonight(26)),
    invited: 'all', participants: [gl4, ny2, ny6, ml8], createdAt: T(now - 6 * H) });
  const ticks = (pattern) => pattern.map(([minAgo, n]) => ({ at: T(now - minAgo * M), n }));
  const tallies = {
    [gl4]: [34, ticks([[95, 6], [70, 4], [40, 8], [12, 6], [3, 10]])],
    [ny2]: [28, ticks([[100, 4], [60, 6], [30, 6], [8, 6], [1, 6]])],
    [ny6]: [41, ticks([[110, 12], [80, 6], [50, 6], [17, 8], [6, 9]])],
    [ml8]: [12, ticks([[90, 6], [45, 6]])],
  };
  for (const [k, [value, t]] of Object.entries(tallies)) await live.collection('tally').doc(k).set({ value, ticks: t, updatedAt: T(now - 60e3) });
  await db.collection('standings').doc(ny6).collection('achievements').doc('firstBattle').set({ battle: live.id, at: T(now - 100 * M) });
  await db.collection('standings').doc(gl4).collection('achievements').doc('firstBattle').set({ battle: live.id, at: T(now - 90 * M) });

  // A challenge for Ny2 from Ml8, starting tomorrow.
  await db.collection('battles').doc('seed-battle-gym').set({ kitchenId: ml8, title: 'Fitness-ugen', metric: 'gym', from: T(tonight(6) + D),
    to: T(tonight(23) + 7 * D), invited: [ny2], participants: [ml8], createdAt: T(now - 30 * M) });
  // For everyone, all of October.
  await db.collection('battles').doc('seed-battle-food').set({ kitchenId: ny3, title: 'Madklub-oktober', metric: 'mealDiners',
    from: T(Date.UTC(2026, 9, 1) - 2 * H), to: T(Date.UTC(2026, 10, 1) - H), invited: 'all', participants: [ny3, m7], createdAt: T(now - 3 * D) });
  // Ended yesterday, for ops/league.js to settle.
  const ended = db.collection('battles').doc('seed-battle-ended');
  await ended.set({ kitchenId: gl7, title: 'Tirsdagsdrikke', metric: 'drinks', from: T(now - 30 * H), to: T(now - 20 * H),
    invited: 'all', participants: [gl7, ny2], createdAt: T(now - 2 * D) });
  // The purchases behind it, so the job's check agrees with the tallies.
  for (const [k, value] of [[gl7, 9], [ny2, 14]]) {
    await ended.collection('tally').doc(k).set({ value, ticks: [], updatedAt: T(now - 21 * H) });
    const ref = db.collection('kitchens').doc(k);
    const [product] = (await ref.collection('products').where('active', '==', true).limit(1).get()).docs;
    const [user] = (await ref.collection('users').where('active', '==', true).limit(1).get()).docs;
    const old = await ref.collection('purchases').where('__name__', '>=', 'seed-').where('__name__', '<', 'seed.').get();
    for (const d of old.docs) await d.ref.delete();
    for (let i = 0; i < value; i++) {
      await ref.collection('purchases').doc(`seed-battle-${i}`).set({
        productId: product.id, productName: product.get('name'), amount: 1, price: product.get('price') || 0,
        userId: user.id, userName: user.get('name'), userRoom: user.get('room') || '', timestamp: T(now - 29 * H + i * 30 * M),
      });
    }
  }

  const kudos = (docId, from, to, kind, badge, reason, at) =>
    db.collection('kudos').doc(docId).set({ from, to, kind, badge, reason, createdAt: T(at) });
  const today = new Date().toISOString().slice(0, 10);
  await kudos(`${gl4}_${ny2}_${today}`, gl4, ny2, 'highfive', null, '', now - 50 * M);
  await kudos('seed-kudos-1', ny6, ny2, 'badge', 'goodFriends', 'Lånte os jeres raclette-grill', now - 3 * H);
  await kudos('seed-kudos-2', ml8, gl4, 'badge', 'bestParty', 'Fredagens åbne køkken var vildt', now - 26 * H);
  await kudos('seed-kudos-3', ny2, m7, 'badge', 'plantBased', 'Den bedste linsegryde i Egmont', now - 2 * D);
  await kudos('seed-kudos-4', gl7, ny6, 'badge', 'loud', 'Vi kunne høre jer fra Gl', now - 3 * D);

  // An open poll (Ny2 has not voted) and one that closed, for the job to count.
  const open = db.collection('polls').doc(`seed-${gl7}_2026-10`);
  await open.set({ kitchenId: gl7, title: 'Bedst til genbrug, oktober', opensAt: T(now - D), closesAt: T(now + 6 * D), createdAt: T(now - D) });
  for (const [from, choice] of [[gl4, m7], [ny6, m7], [ml8, gl7]]) await open.collection('ballots').doc(from).set({ choice, at: T(now - 5 * H) });
  const closed = db.collection('polls').doc(`seed-${ny6}_2026-09`);
  await closed.set({ kitchenId: ny6, title: 'Hyggeligste køkken, september', opensAt: T(now - 8 * D), closesAt: T(now - H), createdAt: T(now - 8 * D) });
  for (const [from, choice] of [[gl4, ny2], [ml8, ny2], [ny3, gl4], [gl7, ny2]]) await closed.collection('ballots').doc(from).set({ choice, at: T(now - 3 * D) });

  await db.collection('seen').doc(ny2).set({ kollegietAt: T(now - 3 * H) });
  console.log('Kollegiet demo data written. Then: node league.js --emulator --daily');
})().catch(e => { console.error(e.message); process.exit(1); });
