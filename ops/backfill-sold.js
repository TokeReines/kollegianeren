#!/usr/bin/env node
// Sets each product's `sold` counter (the buy page's most-bought-first order) from the last
// --days of purchases. From the backup files (--from DIR, no reads) or, without it, from
// Firestore itself (fine for the emulator). One write per product; afterwards every sale
// counts itself up.
//
//   node backfill-sold.js --project prod --from ~/kollegianeren-backups/firebase-ehp [--days 90] [--dry-run]
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 node backfill-sold.js --project demo-kollegianeren
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { init, parseArgs } = require('./lib/firebase');

const args = parseArgs();
const { db } = init(args.project);
const DAYS = +(args.days || 90);
const since = Date.now() - DAYS * 864e5;

function readNdjson(file) {
  return zlib.gunzipSync(fs.readFileSync(file)).toString().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

// kitchenId -> productId -> units
function countFromBackup(dir) {
  const counts = {};
  const root = path.join(dir, 'purchases');
  for (const kid of fs.readdirSync(root)) {
    const perProduct = counts[kid] = {};
    for (const f of fs.readdirSync(path.join(root, kid))) {
      for (const { data } of readNdjson(path.join(root, kid, f))) {
        if ((data.timestamp?.s ?? 0) * 1000 >= since && data.productId) {
          perProduct[data.productId] = (perProduct[data.productId] ?? 0) + (Number(data.amount) || 0);
        }
      }
    }
  }
  return counts;
}

async function countFromFirestore() {
  const counts = {};
  for (const k of await db.collection('kitchens').listDocuments()) {
    const perProduct = counts[k.id] = {};
    const snap = await k.collection('purchases').where('timestamp', '>=', new Date(since)).get();
    for (const d of snap.docs) {
      perProduct[d.get('productId')] = (perProduct[d.get('productId')] ?? 0) + (Number(d.get('amount')) || 0);
    }
  }
  return counts;
}

(async () => {
  const counts = args.from ? countFromBackup(path.resolve(args.from.replace(/^~/, process.env.HOME))) : await countFromFirestore();
  let written = 0, missing = 0;
  for (const [kid, perProduct] of Object.entries(counts)) {
    for (const [productId, units] of Object.entries(perProduct)) {
      if (args['dry-run']) { written++; continue; }
      // update, not set: a product deleted since must not come back.
      await db.doc(`kitchens/${kid}/products/${productId}`).update({ sold: Math.round(units) })
        .then(() => written++, () => missing++);
    }
  }
  console.log(`${args['dry-run'] ? '[dry run] would set' : 'set'} sold on ${written} products from the last ${DAYS} days` +
    (missing ? `, ${missing} no longer exist` : '') + ` (${Object.keys(counts).length} kitchens)`);
})().catch(e => { console.error(e.message); process.exit(1); });
