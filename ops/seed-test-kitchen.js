#!/usr/bin/env node
// A test kitchen for someone trying the app on dev: products with pictures, residents with
// avatars, two weeks of purchases, and invite links (owner and tablet) to register with. The
// tester picks their own email and password on the register page, so no login is handed out.
// Never on prod.
//
//   node seed-test-kitchen.js --project dev --catalogue catalogue.json [--name Testkøkken] [--products 40]
//
// catalogue.json: [{name, price, retailPrice, clId}], e.g. exported from the emulator's Ny2.
const fs = require('fs');
const { Timestamp } = require('firebase-admin/firestore');
const { createAvatar } = require('@dicebear/core');
const { notionists } = require('@dicebear/collection');
const { init, parseArgs, ALIASES } = require('./lib/firebase');
const { newCode } = require('./lib/codes');

const args = parseArgs();
if (args.project === 'prod' || args.project === ALIASES.prod) throw new Error('Never seed test data into prod');
const { db } = init(args.project);
const NAME = args.name || 'Testkøkken';
const COUNT = +(args.products || 40);
// Product photos are public delivery URLs on the prod Cloudinary account (dev has none of them).
const CLOUD = 'egmontkollegiet';
const RESIDENTS = ['Anna Holm', 'Bo Madsen', 'Cecilie Dahl', 'Dan Larsen', 'Emma Friis', 'Frederik Juul', 'Gustav Berg', 'Hanna Lind',
  'Ida Mørk', 'Jonas Krog', 'Karla Vang', 'Lukas Hald', 'Maja Storm', 'Noah Bech', 'Olivia Kjær', 'Peter Skov', 'Rikke Lund',
  'Sofus Bak', 'Tilde Ravn', 'Ulrik Toft', 'Vera Munk', 'William Høj', 'Zara Aagaard'];
const BACKGROUNDS = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'c1f0c1'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const ago = (days, hour) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return Timestamp.fromMillis(Math.min(d.getTime(), Date.now() - 60e3));
};

(async () => {
  const catalogue = JSON.parse(fs.readFileSync(args.catalogue, 'utf8')).filter(p => p.clId).slice(0, COUNT);
  const kitchen = db.collection('kitchens').doc();
  const kid = kitchen.id;
  let batch = db.batch(), writes = 0;
  const flush = async () => { if (writes) { await batch.commit(); batch = db.batch(); writes = 0; } };
  const set = async (ref, data) => { batch.set(ref, data); if (++writes >= 400) await flush(); };

  await set(kitchen, { id: kid, name: NAME });
  const products = catalogue.map((p, i) => ({
    id: `p${i}`, name: p.name, price: Number(p.price) || 6, retailPrice: p.retailPrice ?? null, active: true, clId: '',
    image: `https://res.cloudinary.com/${CLOUD}/image/upload/c_fit,q_60,w_160,h_160/${p.clId}.png`,
    // Stock on every fourth product, two of them running low.
    ...(i % 4 === 0 ? { stock: [48, 3, 24, 2, 36, 12, 30, 18, 40, 6][i / 4 % 10] } : {}),
  }));
  for (const { id, ...p } of products) await set(kitchen.collection('products').doc(id), p);
  const residents = RESIDENTS.map((name, i) => ({ id: `u${i}`, name, room: String(301 + i) }));
  for (const [i, r] of residents.entries()) {
    const image = i % 2 ? '' : 'data:image/svg+xml;base64,' + Buffer.from(createAvatar(notionists, { seed: kid + r.id, size: 96, backgroundColor: [BACKGROUNDS[i % 6]], radius: 50 }).toString()).toString('base64');
    await set(kitchen.collection('users').doc(r.id), { name: r.name, room: r.room, kitchen: kid, image, clId: '', active: true });
  }
  // Two weeks of purchases, busiest in the evenings and at weekends; a few favourites.
  const favourites = products.slice(0, 8);
  const sold = new Map();
  let purchases = 0;
  for (let day = 0; day < 14; day++) {
    const weekend = [5, 6, 0].includes(new Date(Date.now() - day * 864e5).getDay());
    for (let i = 0; i < (weekend ? 30 : 14); i++) {
      const p = Math.random() < .7 ? pick(favourites) : pick(products), u = pick(residents), amount = Math.random() < .8 ? 1 : 2;
      await set(kitchen.collection('purchases').doc(), {
        productId: p.id, productName: p.name, amount, price: p.price * amount,
        userId: u.id, userName: u.name, userRoom: u.room, timestamp: ago(day, pick([16, 18, 19, 20, 21, 21, 22, 23])),
      });
      sold.set(p.id, (sold.get(p.id) ?? 0) + amount);
      purchases++;
    }
  }
  await flush();
  for (const [id, n] of sold) await db.doc(`kitchens/${kid}/products/${id}`).update({ sold: n });

  // Invite links, 14 days: the owner sees everything, the tablet only buys.
  const links = {};
  for (const role of ['owner', 'tablet']) {
    const code = newCode();
    await db.doc(`invites/${code}`).set({
      kitchenId: kid, role, createdBy: 'seed-test-kitchen', createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 14 * 864e5), usedBy: null, usedAt: null,
    });
    links[role] = code;
  }
  console.log(JSON.stringify({ kitchenId: kid, name: NAME, products: products.length, residents: residents.length, purchases, invites: links }, null, 2));
})().catch(e => { console.error(e.message); process.exit(1); });
