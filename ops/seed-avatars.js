#!/usr/bin/env node
// Illustrated avatars for demo residents in the local emulator: every other resident in Ny2 and
// in the demo kitchen, so both the avatar and the initials look can be seen. DiceBear
// "Notionists" (CC0 1.0), generated locally as data URIs: no real faces, no external requests.
//
//   node seed-avatars.js
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8181';
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createAvatar } = require('@dicebear/core');
const { notionists } = require('@dicebear/collection');

const db = getFirestore(initializeApp({ projectId: 'demo-kollegianeren' }));
const BACKGROUNDS = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'c1f0c1'];

(async () => {
  const kitchens = [(await db.collection('kitchens').where('name', '==', 'Ny2').get()).docs[0]?.id, 'demo-mellemste-7'].filter(Boolean);
  let n = 0;
  for (const kid of kitchens) {
    const residents = (await db.collection(`kitchens/${kid}/users`).orderBy('name').get()).docs.filter(d => !d.get('anonymisedAt'));
    for (const [i, d] of residents.entries()) {
      if (i % 2 === 1 || d.get('clId')) continue;
      const svg = createAvatar(notionists, { seed: d.id, size: 96, backgroundColor: [BACKGROUNDS[i % BACKGROUNDS.length]], radius: 50 }).toString();
      await d.ref.update({ image: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') });
      n++;
    }
  }
  console.log(`avatars set for ${n} residents`);
})().catch(e => { console.error(e.message); process.exit(1); });
