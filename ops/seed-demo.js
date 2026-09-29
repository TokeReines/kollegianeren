#!/usr/bin/env node
// Demo data for the local emulators (auth 9099, firestore 8181), on top of the anonymised prod
// copy: extra logins and roles, invites, stock, moved-out residents, fresh purchases for the
// statistics, maker threads and news, and a small referred kitchen. Emulator only; re-runnable.
//
//   node seed-demo.js
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8181';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const ACCOUNTS = path.join(os.homedir(), 'kollegianeren-emulator-data/accounts.json');
const app = initializeApp({ projectId: 'demo-kollegianeren' });
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'));
// A time `days` ago at about `hour`, never in the future: a future-dated purchase would sit on top
// of the buy page's history and hide the ones people actually make.
const ago = (days, hour = 20) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return Timestamp.fromMillis(Math.min(d.getTime(), Date.now() - 60e3 - Math.floor(Math.random() * 3600e3)));
};
const pick = a => a[Math.floor(Math.random() * a.length)];

async function login(uid, email) {
  try { await auth.createUser({ uid, email, password: accounts.password }); } catch (e) { if (!/already/.test(e.message)) throw e; }
  return email;
}

async function kitchenByName(name) {
  const q = await db.collection('kitchens').where('name', '==', name).limit(1).get();
  return q.docs[0];
}

(async () => {
  const ny2 = await kitchenByName('Ny2');
  const kid = ny2.id;
  const products = (await db.collection(`kitchens/${kid}/products`).where('active', '==', true).get()).docs;
  const residents = (await db.collection(`kitchens/${kid}/users`).where('active', '==', true).get()).docs;

  // Logins with roles, as if they had redeemed invites.
  const demo = {};
  for (const [uid, role] of [['demo-treasurer', 'treasurer'], ['demo-tablet', 'tablet']]) {
    const email = await login(uid, `ny2-${role}@kitchen.test`);
    const code = `DEMO-${role.toUpperCase()}`;
    const now = Timestamp.now();
    await db.doc(`invites/${code}`).set({ kitchenId: kid, role, createdBy: kid, createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 14 * 864e5), usedBy: uid, usedAt: now });
    await db.doc(`memberships/${uid}`).set({ kitchenId: kid, role, invite: code, joinedAt: now });
    await db.doc(`kitchens/${kid}/members/${uid}`).set({ role, email, joinedAt: now });
    demo[role] = email;
  }
  // Open invites to see on "Adgang".
  for (const [code, kitchenId, role] of [['OpenTablet42', kid, 'tablet'], ['NewKitchen7x', null, 'owner']]) {
    await db.doc(`invites/${code}`).set({ kitchenId, role, createdBy: kid, createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 10 * 864e5), usedBy: null, usedAt: null });
  }

  // Stock on a few products; two of them running low.
  const stocked = products.slice(0, 8);
  for (const [i, p] of stocked.entries()) await p.ref.update({ stock: [48, 3, 30, 2, 24, 60, 12, 18][i] });

  // Two residents moved out: one recently, one 14 months ago (due for anonymising).
  const movers = residents.slice(-2);
  if (movers[0]) await movers[0].ref.update({ active: false, movedOutAt: ago(20) });
  if (movers[1]) await movers[1].ref.update({ active: false, movedOutAt: ago(430) });

  // Fresh purchases over the last 7 days, busiest in the evenings and at weekends.
  const buyers = residents.slice(0, -2);
  const batch = db.batch();
  let fresh = 0;
  for (let day = 0; day < 7; day++) {
    const weekend = [5, 6, 0].includes(new Date(Date.now() - day * 864e5).getDay());
    for (let i = 0; i < (weekend ? 28 : 12); i++) {
      const p = pick(products), u = pick(buyers), amount = Math.random() < .8 ? 1 : 2;
      batch.set(db.collection(`kitchens/${kid}/purchases`).doc(`demo-${day}-${i}`), {
        amount, price: Number(p.get('price')) * amount, productId: p.id, productName: p.get('name'),
        userId: u.id, userName: u.get('name'), userRoom: u.get('room'), timestamp: ago(day, pick([17, 18, 19, 20, 21, 21, 22, 22, 23, 12, 15])),
      });
      fresh++;
    }
  }
  await batch.commit();

  // Maker inbox: a few threads.
  const threads = [
    ['Ny2', [['kitchen', 'Kan tabletten vise hvem der skylder mest? Det ville hjælpe kassereren.', 3], ['maker', 'God idé, men det bliver ikke en topliste. Jeg kigger på en oversigt kun for kassereren.', 2]]],
    ['Gl4', [['kitchen', 'Vores Faxe Kondi er forsvundet fra listen?', 1]]],
    ['Ny6', [['kitchen', 'Tak for opdateringen! Mørk tilstand er fed om aftenen.', 0]]],
  ];
  for (const [name, msgs] of threads) {
    const k = await kitchenByName(name);
    if (!k) continue;
    for (const [i, [from, text, days]] of msgs.entries()) {
      await db.doc(`kitchens/${k.id}/messages/demo-${i}`).set({ text, from, createdAt: ago(days, 21), seenByMaker: from === 'maker', seenByKitchen: from === 'kitchen' });
    }
  }

  // More news.
  for (const [id, title, body, days] of [
    ['demo-stock', 'Nyt: lager og avance', 'Under Produkter kan I nu følge lageret for hver vare. Køb trækker automatisk fra, og I får besked, når noget er ved at slippe op.', 1],
    ['demo-roles', 'Nyt: flere logins pr. køkken', 'Kassereren kan nu få sit eget login, og køkkenets tablet kan få et login, der kun kan købe. Se Adgang i menuen.', 5],
  ]) await db.doc(`announcements/${id}`).set({ title, body, createdAt: ago(days, 10) });

  // A small referred kitchen with its own owner.
  const newKid = 'demo-mellemste-7';
  const ownerEmail = await login('demo-m7-owner', 'm7-owner@kitchen.test');
  await db.doc(`kitchens/${newKid}`).set({ id: newKid, name: 'Mellemste 7' });
  await db.doc(`invites/DEMO-REFERRAL`).set({ kitchenId: null, role: 'owner', createdBy: kid, createdAt: ago(4), expiresAt: Timestamp.fromMillis(Date.now() + 10 * 864e5), usedBy: 'demo-m7-owner', usedAt: ago(4) });
  await db.doc(`memberships/demo-m7-owner`).set({ kitchenId: newKid, role: 'owner', invite: 'DEMO-REFERRAL', joinedAt: ago(4) });
  await db.doc(`kitchens/${newKid}/members/demo-m7-owner`).set({ role: 'owner', email: ownerEmail, joinedAt: ago(4) });
  const m7products = [['Tuborg Grøn', 7, 5.2, 36], ['Carlsberg', 7, 5.4, 4], ['Cola', 6, 4.1, 20], ['Sodavand', 5, 3.5, null]];
  for (const [i, [name, price, retailPrice, stock]] of m7products.entries()) {
    await db.doc(`kitchens/${newKid}/products/p${i}`).set({ name, price, retailPrice, active: true, image: '', clId: '', ...(stock === null ? {} : { stock }) });
  }
  const m7residents = ['Anna', 'Bo', 'Cecilie', 'Dan', 'Emma', 'Frederik'];
  for (const [i, name] of m7residents.entries()) {
    await db.doc(`kitchens/${newKid}/users/u${i}`).set({ name, room: String(701 + i), kitchen: newKid, image: '', clId: '', active: true });
  }
  const b2 = db.batch();
  for (let i = 0; i < 40; i++) {
    const pi = i % m7products.length, ui = i % m7residents.length;
    b2.set(db.doc(`kitchens/${newKid}/purchases/demo-${i}`), {
      amount: 1, price: m7products[pi][1], productId: `p${pi}`, productName: m7products[pi][0], userId: `u${ui}`,
      userName: m7residents[ui], userRoom: String(701 + ui), timestamp: ago(i % 4, pick([18, 20, 21, 22])),
    });
  }
  await b2.commit();

  accounts.demo = { ny2Treasurer: demo.treasurer, ny2Tablet: demo.tablet, mellemste7Owner: ownerEmail, openInvite: 'OpenTablet42', openReferral: 'NewKitchen7x' };
  fs.writeFileSync(ACCOUNTS, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  console.log(`Ny2: 2 logins (treasurer, tablet), ${stocked.length} products with stock, 2 moved out, ${fresh} purchases in the last 7 days`);
  console.log(`inbox: ${threads.length} threads, 2 news posts, kitchen "Mellemste 7" with ${m7products.length} products, ${m7residents.length} residents, 40 purchases`);
  console.log('open invites: OpenTablet42 (tablet in Ny2), NewKitchen7x (new kitchen)');
})().catch(e => { console.error(e.message); process.exit(1); });
