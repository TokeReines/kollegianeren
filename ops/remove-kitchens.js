#!/usr/bin/env node
// Removes kitchens and login accounts for good (#66). Every kitchen is archived first: its doc and
// all subcollections, gzipped ndjson in --archive/<kitchen id>/. Refuses kitchens with purchases
// unless --allow-purchases. Without --confirm it only prints what it would do.
//
//   node remove-kitchens.js --project prod --kitchens id1,id2 [--logins uid1,uid2] [--archive DIR] [--confirm]
//
// --kitchens also deletes the legacy owner login (uid == kitchen id). --logins deletes extra
// accounts that have no kitchen.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { init, parseArgs } = require('./lib/firebase');
const { encode } = require('./lib/codec');

const args = parseArgs();
const { projectId, db, auth } = init(args.project);
const list = v => (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
const KITCHENS = list(args.kitchens);
const LOGINS = list(args.logins);
const ARCHIVE = path.resolve((args.archive || path.join(os.homedir(), 'kollegianeren-archive', projectId)).replace(/^~/, os.homedir()));
const CONFIRM = !!args.confirm;

// Every document below `ref`, at any depth.
async function collectTree(ref) {
  const docs = [];
  for (const c of await ref.listCollections()) {
    for (const d of (await c.get()).docs) docs.push(d, ...(await collectTree(d.ref)));
  }
  return docs;
}

(async () => {
  console.log(`${projectId}: ${CONFIRM ? 'REMOVING' : 'dry run, add --confirm to remove'}`);
  for (const kid of KITCHENS) {
    const ref = db.doc(`kitchens/${kid}`);
    const snap = await ref.get();
    const docs = await collectTree(ref);
    const purchases = docs.filter(d => d.ref.parent.id === 'purchases').length;
    // Anything elsewhere that still points at this kitchen.
    const refs = [];
    for (const [c, field] of [['memberships', 'kitchenId'], ['invites', 'kitchenId'], ['residentLinks', 'kitchenId']]) {
      refs.push(...(await db.collection(c).where(field, '==', kid).get()).docs);
    }
    const login = await auth.getUser(kid).catch(() => null);
    console.log(`kitchen ${kid} "${snap.exists ? snap.get('name') : '(no doc)'}": ${docs.length} docs below it (${purchases} purchases), ` +
      `${refs.length} references (${refs.map(d => d.ref.path).join(', ') || 'none'}), login ${login ? login.email || login.uid : 'none'}`);
    if (purchases && !args['allow-purchases']) { console.log('  has purchases, skipped (use --allow-purchases)'); continue; }
    if (!CONFIRM) continue;

    const dir = path.join(ARCHIVE, kid);
    fs.mkdirSync(dir, { recursive: true });
    const all = [...(snap.exists ? [snap] : []), ...docs, ...refs];
    fs.writeFileSync(path.join(dir, 'docs.ndjson.gz'), zlib.gzipSync(all.map(d => JSON.stringify({ path: d.ref.path, data: encode(d.data()) })).join('\n') + '\n'));
    if (login) fs.writeFileSync(path.join(dir, 'login.json'), JSON.stringify(login.toJSON(), null, 2));
    console.log(`  archived ${all.length} docs in ${dir}`);

    // Deepest first, so no orphaned parents are left if a batch fails half way.
    const order = [...docs, ...refs].sort((a, b) => b.ref.path.split('/').length - a.ref.path.split('/').length);
    for (let i = 0; i < order.length; i += 400) {
      const batch = db.batch();
      order.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    if (snap.exists) await ref.delete();
    if (login) await auth.deleteUser(kid);
    console.log(`  removed ${order.length + (snap.exists ? 1 : 0)} docs${login ? ' and the login' : ''}`);
  }

  for (const uid of LOGINS) {
    const u = await auth.getUser(uid).catch(() => null);
    if (!u) { console.log(`login ${uid}: not found`); continue; }
    const owns = (await db.doc(`kitchens/${uid}`).get()).exists || (await db.doc(`memberships/${uid}`).get()).exists || (await db.doc(`admins/${uid}`).get()).exists;
    console.log(`login ${uid} ${u.email || '(no email)'} created ${u.metadata.creationTime}, last sign-in ${u.metadata.lastSignInTime || 'never'}${owns ? ': has a kitchen, membership or admin doc, skipped' : ''}`);
    if (owns || !CONFIRM) continue;
    fs.mkdirSync(path.join(ARCHIVE, 'logins'), { recursive: true });
    fs.writeFileSync(path.join(ARCHIVE, 'logins', `${uid}.json`), JSON.stringify(u.toJSON(), null, 2));
    await auth.deleteUser(uid);
    console.log('  removed');
  }
})().catch(e => { console.error(e.message); process.exit(1); });
