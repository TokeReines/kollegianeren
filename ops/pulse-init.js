#!/usr/bin/env node
// Creates pulse/kollegiet with every kind stamped now (src/app/services/pulse.service.ts), so apps
// fetch each list once and then only when it changes. Safe to run again: it only moves the times.
//
//   node pulse-init.js --project dev|prod     (or --emulator)
const { FieldValue } = require('firebase-admin/firestore');
const { parseArgs } = require('./lib/firebase');

const args = parseArgs();
let db;
if (args.emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8181';
  db = require('firebase-admin/firestore').getFirestore(require('firebase-admin/app').initializeApp({ projectId: 'demo-kollegianeren' }));
} else {
  db = require('./lib/firebase').init(args.project).db;
}
const KINDS = ['kitchens', 'events', 'kudos', 'battles', 'posts', 'news', 'proposals'];
db.doc('pulse/kollegiet').set(Object.fromEntries(KINDS.map(k => [k, FieldValue.serverTimestamp()])), { merge: true })
  .then(() => console.log(`pulse/kollegiet stamped: ${KINDS.join(', ')}`))
  .catch(e => { console.error(e.message); process.exit(1); });
