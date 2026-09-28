#!/usr/bin/env node
// Restores a backup made by backup.js.
//
//   node restore.js --from DIR --project dev [--anonymise] [--kitchens id1,id2]
//                   [--rename-kitchen fromId=toId] [--max-writes 15000] [--dry-run]
//
// With FIRESTORE_EMULATOR_HOST set, writes go to the local emulator (no quota), which is
// the normal way to get realistic data for development:
//
//   firebase emulators:start --only firestore --project demo-kollegianeren --import ./emulator-data --export-on-exit
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 node restore.js --from ~/kollegianeren-backups/firebase-ehp --project demo-kollegianeren --anonymise
//
// Restoring into prod requires --i-really-mean-prod.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { init, parseArgs, ALIASES } = require('./lib/firebase');
const { decode } = require('./lib/codec');

const args = parseArgs();
if (!args.from) throw new Error('Missing --from backup dir');
const FROM = path.resolve(args.from.replace(/^~/, require('os').homedir()));
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const target = ALIASES[args.project] || args.project;
if (target === ALIASES.prod && !args['i-really-mean-prod']) throw new Error('Refusing to restore into prod without --i-really-mean-prod');
if (target === ALIASES.prod && args.anonymise) throw new Error('Never anonymise into prod');
const MAX_WRITES = emulator ? Infinity : +(args['max-writes'] || 15000);
const onlyKitchens = args.kitchens ? new Set(String(args.kitchens).split(',')) : null;
const renames = Object.fromEntries((args['rename-kitchen'] ? [].concat(args['rename-kitchen']) : [])
  .map(r => String(r).split('=')));

const { db } = emulator
  ? { db: require('firebase-admin/firestore').getFirestore(require('firebase-admin/app').initializeApp({ projectId: target })) }
  : init(target);

function readNdjson(file) {
  return zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

// Stable fake identities per resident, shared by users and the denormalised fields on purchases.
const fakes = new Map();
function fakeResident(kitchenId, userId) {
  const key = `${kitchenId}/${userId}`;
  if (!fakes.has(key)) {
    const n = fakes.size + 1;
    fakes.set(key, { name: `Beboer ${n}`, room: String(100 + (n % 900)) });
  }
  return fakes.get(key);
}

function anonymise(docPath, data) {
  const [, kitchenId, collection, id] = docPath.split('/');
  if (collection === 'users') {
    const f = fakeResident(kitchenId, id);
    return { ...data, name: f.name, room: f.room, image: '', clId: '' };
  }
  if (collection === 'purchases' && data.userId) {
    const f = fakeResident(kitchenId, data.userId);
    return { ...data, userName: f.name, userRoom: f.room };
  }
  return data;
}

function mapPath(docPath) {
  const parts = docPath.split('/');
  if (renames[parts[1]]) parts[1] = renames[parts[1]];
  return parts.join('/');
}

function collectRecords() {
  const snapshots = fs.readdirSync(path.join(FROM, 'snapshots')).sort();
  const latest = path.join(FROM, 'snapshots', snapshots[snapshots.length - 1]);
  const records = new Map();
  const add = r => {
    const kitchenId = r.path.split('/')[1];
    if (!onlyKitchens || onlyKitchens.has(kitchenId)) records.set(r.path, r);
  };
  readNdjson(path.join(latest, 'kitchens.ndjson.gz')).forEach(add);
  for (const k of fs.readdirSync(latest).filter(f => !f.endsWith('.gz'))) {
    for (const f of fs.readdirSync(path.join(latest, k))) readNdjson(path.join(latest, k, f)).forEach(add);
  }
  const pdir = path.join(FROM, 'purchases');
  if (fs.existsSync(pdir)) {
    for (const k of fs.readdirSync(pdir)) {
      // File names start with the run time, so later chunks overwrite earlier copies of a doc.
      for (const f of fs.readdirSync(path.join(pdir, k)).sort()) readNdjson(path.join(pdir, k, f)).forEach(add);
    }
  }
  return { latest, records: [...records.values()] };
}

(async () => {
  const { latest, records } = collectRecords();
  // Kitchens and small collections first, so a capped restore still gives usable kitchens.
  const rank = p => (p.split('/').length === 2 ? 0 : p.includes('/purchases/') ? 2 : 1);
  records.sort((a, b) => rank(a.path) - rank(b.path));
  const todo = records.slice(0, MAX_WRITES);
  console.log(`snapshot ${latest}, ${records.length} docs, writing ${todo.length} to ${emulator ? 'emulator ' + process.env.FIRESTORE_EMULATOR_HOST : target}` +
    `${args.anonymise ? ' (anonymised)' : ''}${args['dry-run'] ? ' [dry run]' : ''}`);
  if (args['dry-run']) return;

  const writer = db.bulkWriter();
  let written = 0;
  for (const r of todo) {
    let data = decode(r.data, db);
    if (args.anonymise) data = anonymise(r.path, data);
    writer.set(db.doc(mapPath(r.path)), data).then(() => { if (++written % 5000 === 0) console.log(`  ${written}`); });
  }
  await writer.close();

  const counts = {};
  for (const r of todo) { const c = r.path.split('/')[2] || 'kitchens'; counts[c] = (counts[c] || 0) + 1; }
  console.log(`done: ${written} written`, counts);
})().catch(e => { console.error(e); process.exit(1); });
