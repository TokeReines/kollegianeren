// Replays every Firestore call the app makes (src/app/services/*) against firestore.rules,
// and checks that kitchens cannot reach each other's data.
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment, assertSucceeds, assertFails,
} = require('@firebase/rules-unit-testing');
const { increment, arrayUnion, arrayRemove,
  doc, collection, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, Timestamp, serverTimestamp, collectionGroup, writeBatch,
} = require('firebase/firestore');

let env;
const A = 'kitchenA';
const B = 'kitchenB';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kollegianeren',
    // RULES=path/to/other.rules runs the suite against another rules file.
    firestore: { rules: fs.readFileSync(process.env.RULES || path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins', 'maker'), {});
    for (const k of [A, B]) {
      await setDoc(doc(db, 'kitchens', k), { id: k, name: k === A ? 'Ny2' : 'Gl4' });
      await setDoc(doc(db, 'kitchens', k, 'messages', 'm1'), { text: 'hi', from: 'kitchen', createdAt: Timestamp.now(), seenByMaker: false, seenByKitchen: true });
      await setDoc(doc(db, 'kitchens', k, 'users', 'u1'), { name: 'Resident', room: '101', kitchen: k, active: true });
      await setDoc(doc(db, 'kitchens', k, 'products', 'p1'), { name: 'Beer', price: 5, retailPrice: 3, active: true });
      await setDoc(doc(db, 'kitchens', k, 'purchases', 'x1'), {
        amount: 1, productId: 'p1', productName: 'Beer', price: 5, userId: 'u1', userName: 'Resident', userRoom: '101',
        timestamp: Timestamp.fromDate(new Date('2026-09-01T20:00:00Z')),
      });
    }
  });
});

const asKitchen = uid => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

// Register page: RegisterComponent lists taken kitchens before sign-in, then sets its own doc.
test('anyone can list taken kitchens (register page)', async () => {
  await assertSucceeds(getDocs(collection(anon(), 'kitchens')));
});
test('open self-registration is closed: a new login cannot create a kitchen on its own', async () => {
  await assertFails(setDoc(doc(asKitchen('newKitchen'), 'kitchens', 'newKitchen'), { id: 'newKitchen', name: 'm6' }));
});
test('a kitchen cannot create or overwrite another kitchen doc', async () => {
  await assertFails(setDoc(doc(asKitchen(A), 'kitchens', 'someoneElse'), { id: 'someoneElse', name: 'x' }));
  await assertFails(setDoc(doc(asKitchen(A), 'kitchens', B), { id: B, name: 'hijacked' }));
});
test('nobody can delete kitchen docs', async () => {
  await assertFails(deleteDoc(doc(asKitchen(A), 'kitchens', A)));
  await assertFails(deleteDoc(doc(anon(), 'kitchens', A)));
});

// Everything under the kitchen: ProductService, UserService, PurchaseService.
const purchase = (extra = {}) => ({
  amount: 1, productId: 'p1', productName: 'Beer', price: 5, userId: 'u1', userName: 'Resident', userRoom: '101',
  timestamp: serverTimestamp(), ...extra,
});
// What the app writes for each collection.
const sample = { products: () => ({ name: 'new' }), users: () => ({ name: 'new' }), purchases: () => purchase() };
// PurchaseService.remove: the delete and its note in removed/, in one batch. The note copies the
// purchase; for x1 exactly, for one just bought the app may only have its own timestamp estimate.
const x1Note = (extra = {}) => ({
  userId: 'u1', productName: 'Beer', amount: 1, price: 5, timestamp: Timestamp.fromDate(new Date('2026-09-01T20:00:00Z')),
  removedAt: serverTimestamp(), ...extra,
});
const takeBack = (db, id, note = x1Note({ timestamp: Timestamp.now() })) => {
  const b = writeBatch(db);
  b.delete(doc(db, 'kitchens', A, 'purchases', id));
  b.set(doc(db, 'kitchens', A, 'removed', id), note);
  return b.commit();
};
const change = { products: { name: 'changed' }, users: { name: 'changed' }, purchases: { amount: 2 } };

for (const sub of ['products', 'users', 'purchases']) {
  test(`own kitchen: full CRUD on ${sub}`, async () => {
    const db = asKitchen(A);
    await assertSucceeds(getDocs(collection(db, 'kitchens', A, sub)));
    const ref = await assertSucceeds(addDoc(collection(db, 'kitchens', A, sub), sample[sub]()));
    await assertSucceeds(updateDoc(doc(db, 'kitchens', A, sub, ref.id), change[sub]));
    if (sub === 'purchases') {
      await assertFails(deleteDoc(doc(db, 'kitchens', A, sub, ref.id))); // without its note
      await assertSucceeds(takeBack(db, ref.id, x1Note({ amount: 2, timestamp: Timestamp.now() })));
    } else {
      await assertSucceeds(deleteDoc(doc(db, 'kitchens', A, sub, ref.id)));
    }
  });
  test(`other kitchen: no access to ${sub}`, async () => {
    const db = asKitchen(A);
    await assertFails(getDocs(collection(db, 'kitchens', B, sub)));
    await assertFails(getDoc(doc(db, 'kitchens', B, sub, sub === 'purchases' ? 'x1' : sub[0] + '1')));
    await assertFails(addDoc(collection(db, 'kitchens', B, sub), { name: 'x' }));
  });
  test(`signed out: no access to ${sub}`, async () => {
    await assertFails(getDocs(collection(anon(), 'kitchens', A, sub)));
    await assertFails(addDoc(collection(anon(), 'kitchens', A, sub), { name: 'x' }));
  });
}

test('buy page: newest purchases (orderBy timestamp desc, limit 30)', async () => {
  const q = query(collection(asKitchen(A), 'kitchens', A, 'purchases'), orderBy('timestamp', 'desc'), limit(30));
  await assertSucceeds(getDocs(q));
});
test('buy page: add a purchase with a server timestamp', async () => {
  await assertSucceeds(addDoc(collection(asKitchen(A), 'kitchens', A, 'purchases'), {
    amount: 2, productId: 'p1', productName: 'Beer', price: 5, userId: 'u1', userName: 'Resident', userRoom: '101',
    timestamp: serverTimestamp(),
  }));
});
test('accounting: purchases in a date range', async () => {
  const q = query(collection(asKitchen(A), 'kitchens', A, 'purchases'),
    where('timestamp', '>=', new Date('2026-09-01')), where('timestamp', '<', new Date('2026-10-01')));
  await assertSucceeds(getDocs(q));
});
test('no collection-group or root-level access to other paths', async () => {
  await assertFails(getDocs(collection(asKitchen(A), 'anything')));
  await assertFails(setDoc(doc(asKitchen(A), 'anything', 'x'), { a: 1 }));
});

// Purchase validation (#80).
const addPurchase = p => addDoc(collection(asKitchen(A), 'kitchens', A, 'purchases'), p);
test('purchases: historical quirks still accepted (null price, numeric room)', async () => {
  await assertSucceeds(addPurchase(purchase({ price: null })));
  await assertSucceeds(addPurchase(purchase({ userRoom: 101 })));
});
test('purchases: rejects bad shapes', async () => {
  await assertFails(addPurchase(purchase({ amount: 0 })));
  await assertFails(addPurchase(purchase({ amount: 1.5 })));
  await assertFails(addPurchase(purchase({ amount: '1' })));
  await assertFails(addPurchase(purchase({ price: -5 })));
  await assertFails(addPurchase(purchase({ extra: true })));
  await assertFails(addPurchase({ ...purchase(), timestamp: Timestamp.fromDate(new Date('2020-01-01')) }));
  const { productId, ...noProduct } = purchase();
  await assertFails(addPurchase(noProduct));
});
test('removed: the note must match the purchase it goes with, and stays', async () => {
  const db = asKitchen(A);
  await assertFails(takeBack(db, 'x1', x1Note({ amount: 2 })));
  await assertFails(takeBack(db, 'x1', x1Note({ price: 0 })));
  await assertFails(takeBack(db, 'x1', x1Note({ userId: 'u2' })));
  await assertFails(takeBack(db, 'x1', x1Note({ timestamp: Timestamp.now() }))); // an old purchase's own time
  await assertFails(takeBack(db, 'x1', x1Note({ userName: 'Resident' })));
  await assertFails(setDoc(doc(db, 'kitchens', A, 'removed', 'x1'), x1Note())); // without the delete
  await assertSucceeds(takeBack(db, 'x1', x1Note()));
  const note = doc(db, 'kitchens', A, 'removed', 'x1');
  await assertSucceeds(getDocs(query(collection(db, 'kitchens', A, 'removed'), where('removedAt', '>', Timestamp.fromMillis(0)))));
  await assertFails(updateDoc(note, { amount: 0 }));
  await assertFails(deleteDoc(note));
  await assertFails(getDoc(doc(asKitchen(B), 'kitchens', A, 'removed', 'x1')));
  await assertFails(getDocs(collection(anon(), 'kitchens', A, 'removed')));
});
test('purchases: updates cannot move the timestamp', async () => {
  const db = asKitchen(A);
  await assertFails(updateDoc(doc(db, 'kitchens', A, 'purchases', 'x1'), { timestamp: Timestamp.fromDate(new Date('2020-01-01')) }));
  await assertSucceeds(updateDoc(doc(db, 'kitchens', A, 'purchases', 'x1'), { amount: 3 }));
});
test('kitchen doc: only {id, name} with id == uid', async () => {
  await assertFails(setDoc(doc(asKitchen(A), 'kitchens', A), { id: A, name: 'x', admin: true }));
  await assertFails(setDoc(doc(asKitchen(A), 'kitchens', A), { id: 'other', name: 'x' }));
  await assertSucceeds(setDoc(doc(asKitchen(A), 'kitchens', A), { id: A, name: 'Ny2 (renamed)' }));
});

// Replays the shapes of real purchases from the local backup, if there is one (not in CI).
const backupDir = path.join(require('os').homedir(), 'kollegianeren-backups/firebase-ehp/purchases');
test('purchases: every distinct real-world shape from the backup is accepted', { skip: !fs.existsSync(backupDir) && 'no local backup' }, async () => {
  const zlib = require('zlib');
  const shapes = new Map();
  for (const k of fs.readdirSync(backupDir)) for (const f of fs.readdirSync(path.join(backupDir, k))) {
    for (const l of zlib.gunzipSync(fs.readFileSync(path.join(backupDir, k, f))).toString().split(String.fromCharCode(10)).filter(Boolean)) {
      const d = JSON.parse(l).data;
      const key = Object.entries(d).map(([n, v]) => n + ':' + (v === null ? 'null' : v.__t || typeof v) + (n === 'amount' && v > 20 ? '>20' : '')).sort().join(',');
      if (!shapes.has(key)) shapes.set(key, d);
    }
  }
  for (const d of shapes.values()) {
    const { timestamp, ...rest } = d;
    await assertSucceeds(addPurchase({ ...rest, timestamp: serverTimestamp() }));
  }
  console.log(`# replayed ${shapes.size} distinct purchase shapes`);
});

// Maker features (#84, #85).
const maker = () => asKitchen('maker');
const msg = (from, extra = {}) => ({ text: 'Hej', from, createdAt: serverTimestamp(), seenByMaker: from === 'maker', seenByKitchen: from === 'kitchen', ...extra });
test('announcements: every signed-in kitchen reads, only admins post', async () => {
  await assertSucceeds(getDocs(collection(asKitchen(A), 'announcements')));
  await assertFails(getDocs(collection(anon(), 'announcements')));
  await assertFails(addDoc(collection(asKitchen(A), 'announcements'), { title: 'x', body: 'y', createdAt: serverTimestamp() }));
  await assertSucceeds(addDoc(collection(maker(), 'announcements'), { title: 'Nyt', body: 'Tekst', createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(maker(), 'announcements'), { title: '', body: 'Tekst', createdAt: serverTimestamp() }));
});
test('admins: nobody can make themselves admin', async () => {
  await assertFails(setDoc(doc(asKitchen(A), 'admins', A), {}));
  await assertSucceeds(getDoc(doc(maker(), 'admins', 'maker')));
  await assertFails(getDoc(doc(asKitchen(A), 'admins', 'maker')));
});
test('messages: kitchen writes its own side only', async () => {
  const col = collection(asKitchen(A), 'kitchens', A, 'messages');
  await assertSucceeds(addDoc(col, msg('kitchen')));
  await assertFails(addDoc(col, msg('maker')));
  await assertFails(addDoc(col, msg('kitchen', { seenByMaker: true })));
  await assertFails(addDoc(col, msg('kitchen', { text: '' })));
  // A screenshot with it, or only pictures; up to four.
  await assertSucceeds(addDoc(col, msg('kitchen', { images: ['dev/shot'] })));
  await assertSucceeds(addDoc(col, msg('kitchen', { text: '', images: ['dev/shot'] })));
  await assertFails(addDoc(col, msg('kitchen', { text: '', images: [] })));
  await assertFails(addDoc(col, msg('kitchen', { images: ['a', 'b', 'c', 'd', 'e'] })));
  await assertFails(addDoc(col, msg('kitchen', { images: 'dev/shot' })));
  await assertFails(addDoc(collection(asKitchen(A), 'kitchens', B, 'messages'), msg('kitchen')));
  await assertFails(getDocs(collection(asKitchen(A), 'kitchens', B, 'messages')));
  await assertFails(updateDoc(doc(asKitchen(A), 'kitchens', A, 'messages', 'm1'), { text: 'edited' }));
  await assertFails(updateDoc(doc(asKitchen(A), 'kitchens', A, 'messages', 'm1'), { seenByMaker: true }));
  await assertFails(deleteDoc(doc(asKitchen(A), 'kitchens', A, 'messages', 'm1')));
});
test('messages: maker reads the inbox, replies, marks seen, and nothing else', async () => {
  await assertSucceeds(getDocs(collectionGroup(maker(), 'messages')));
  await assertFails(getDocs(collectionGroup(asKitchen(A), 'messages')));
  await assertSucceeds(addDoc(collection(maker(), 'kitchens', A, 'messages'), msg('maker')));
  await assertFails(addDoc(collection(maker(), 'kitchens', A, 'messages'), msg('kitchen')));
  await assertSucceeds(updateDoc(doc(maker(), 'kitchens', A, 'messages', 'm1'), { seenByMaker: true }));
  await assertFails(getDocs(collection(maker(), 'kitchens', A, 'purchases')));
  await assertFails(getDocs(collection(maker(), 'kitchens', A, 'users')));
});

// Members, roles and invites (#82, #83, #88).
const days = n => Timestamp.fromMillis(Date.now() + n * 864e5);
const invite = (kitchenId, role, createdBy, extra = {}) => ({
  kitchenId, role, createdBy, createdAt: serverTimestamp(), expiresAt: days(7), usedBy: null, usedAt: null, ...extra,
});
async function seedInvite(code, data) {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'invites', code), data));
}
function redeem(uid, code, kitchenId, role, newKitchenName) {
  const db = asKitchen(uid);
  const b = writeBatch(db);
  b.update(doc(db, 'invites', code), { usedBy: uid, usedAt: serverTimestamp() });
  if (newKitchenName) b.set(doc(db, 'kitchens', kitchenId), { id: kitchenId, name: newKitchenName });
  b.set(doc(db, 'memberships', uid), { kitchenId, role, invite: code, joinedAt: serverTimestamp() });
  b.set(doc(db, 'kitchens', kitchenId, 'members', uid), { role, email: uid + '@test', joinedAt: serverTimestamp() });
  return b.commit();
}
const unused = () => ({ kitchenId: A, role: 'tablet', createdBy: A, createdAt: Timestamp.now(), expiresAt: days(7), usedBy: null, usedAt: null });

test('invites: owner and treasurer invite tablets; tablets and outsiders cannot', async () => {
  await assertSucceeds(setDoc(doc(asKitchen(A), 'invites', 'c1'), invite(A, 'tablet', A)));
  await assertSucceeds(setDoc(doc(asKitchen(A), 'invites', 'c2'), invite(A, 'treasurer', A)));
  await assertFails(setDoc(doc(asKitchen(A), 'invites', 'c3'), invite(A, 'owner', A)));
  await assertFails(setDoc(doc(asKitchen(A), 'invites', 'c4'), invite(B, 'tablet', A)));
  await assertFails(setDoc(doc(asKitchen(A), 'invites', 'c5'), invite(A, 'tablet', A, { expiresAt: days(60) })));
  await seedInvite('t1', unused()); await assertSucceeds(redeem('tab', 't1', A, 'tablet'));
  await assertFails(setDoc(doc(asKitchen('tab'), 'invites', 'c6'), invite(A, 'tablet', 'tab')));
  await assertFails(setDoc(doc(asKitchen('stranger'), 'invites', 'c7'), invite(null, 'owner', 'stranger')));
});
test('invites: joining a kitchen as a tablet', async () => {
  await seedInvite('t1', unused());
  await assertSucceeds(getDoc(doc(anon(), 'invites', 't1')));
  await assertFails(getDocs(collection(anon(), 'invites')));
  await assertFails(redeem('tab', 't1', B, 'tablet')); // wrong kitchen
  await assertFails(redeem('tab', 't1', A, 'owner')); // wrong role
  await assertSucceeds(redeem('tab', 't1', A, 'tablet'));
  await assertFails(redeem('other', 't1', A, 'tablet')); // already used
});
test('tablet role: buys, reads, undoes within a minute, nothing else', async () => {
  await seedInvite('t1', unused()); await redeem('tab', 't1', A, 'tablet');
  const db = asKitchen('tab');
  await assertSucceeds(getDocs(collection(db, 'kitchens', A, 'products')));
  await assertSucceeds(getDocs(query(collection(db, 'kitchens', A, 'purchases'), orderBy('timestamp', 'desc'), limit(30))));
  const ref = await assertSucceeds(addDoc(collection(db, 'kitchens', A, 'purchases'), purchase()));
  await assertSucceeds(takeBack(db, ref.id)); // undo
  await assertFails(takeBack(db, 'x1', x1Note())); // old purchase
  await assertFails(addDoc(collection(db, 'kitchens', A, 'products'), { name: 'x' }));
  await assertFails(updateDoc(doc(db, 'kitchens', A, 'users', 'u1'), { name: 'x' }));
  await assertFails(setDoc(doc(db, 'kitchens', A), { id: A, name: 'hacked' }));
  await assertFails(getDocs(collection(db, 'kitchens', B, 'purchases')));
});
test('treasurer role: manages products, cannot remove members', async () => {
  await seedInvite('t2', { ...unused(), role: 'treasurer' }); await redeem('tre', 't2', A, 'treasurer');
  const db = asKitchen('tre');
  await assertSucceeds(addDoc(collection(db, 'kitchens', A, 'products'), { name: 'x' }));
  await assertSucceeds(takeBack(db, 'x1', x1Note()));
  await seedInvite('t1', unused()); await redeem('tab', 't1', A, 'tablet');
  await assertSucceeds(getDocs(collection(db, 'kitchens', A, 'members')));
  await assertFails(deleteDoc(doc(db, 'kitchens', A, 'members', 'tab')));
});
test('removing a member cannot be undone by replaying the old invite', async () => {
  await seedInvite('t1', unused()); await redeem('tab', 't1', A, 'tablet');
  const owner = asKitchen(A);
  await assertSucceeds(deleteDoc(doc(owner, 'kitchens', A, 'members', 'tab')));
  await assertSucceeds(deleteDoc(doc(owner, 'memberships', 'tab')));
  await assertFails(getDocs(collection(asKitchen('tab'), 'kitchens', A, 'products')));
  const db = asKitchen('tab');
  await assertFails(setDoc(doc(db, 'memberships', 'tab'), { kitchenId: A, role: 'tablet', invite: 't1', joinedAt: serverTimestamp() }));
});
test('no membership, kitchen or member without an invite', async () => {
  const db = asKitchen('eve');
  await assertFails(setDoc(doc(db, 'memberships', 'eve'), { kitchenId: A, role: 'owner', invite: 'nope', joinedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'kitchens', A, 'members', 'eve'), { role: 'owner', email: 'e', joinedAt: serverTimestamp() }));
  await seedInvite('ex', { ...unused(), expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  await assertFails(redeem('eve', 'ex', A, 'tablet'));
});
test('referral: an owner (or the maker) invites a brand new kitchen', async () => {
  await assertSucceeds(setDoc(doc(asKitchen(A), 'invites', 'r1'), invite(null, 'owner', A)));
  await assertSucceeds(setDoc(doc(maker(), 'invites', 'r2'), invite(null, 'owner', 'maker')));
  await assertSucceeds(redeem('neo', 'r1', 'kitchenNew', 'owner', 'Mellemste 7'));
  const db = asKitchen('neo');
  await assertSucceeds(addDoc(collection(db, 'kitchens', 'kitchenNew', 'products'), { name: 'Beer' }));
  await assertSucceeds(setDoc(doc(db, 'invites', 'r3'), invite('kitchenNew', 'tablet', 'neo')));
  // A referral cannot take over an existing kitchen.
  await assertFails(redeem('mallory', 'r2', B, 'owner', 'mine now'));
});
test('invites: managers list their kitchen invites and can revoke them', async () => {
  await seedInvite('t1', unused());
  await assertSucceeds(getDocs(query(collection(asKitchen(A), 'invites'), where('kitchenId', '==', A))));
  await assertFails(getDocs(query(collection(asKitchen(B), 'invites'), where('kitchenId', '==', A))));
  await assertSucceeds(deleteDoc(doc(asKitchen(A), 'invites', 't1')));
});

// Stock (#90).
test('sold: tablets move the sold counter, also on untracked products', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'kitchens', A, 'products', 'p1'), { stock: null, sold: 10 }));
  await seedInvite('t2', unused()); await redeem('tab2', 't2', A, 'tablet');
  const p = doc(asKitchen('tab2'), 'kitchens', A, 'products', 'p1');
  await assertSucceeds(updateDoc(p, { sold: increment(3) }));
  await assertSucceeds(updateDoc(p, { sold: increment(-3) }));
  await assertFails(updateDoc(p, { sold: 5000 }));
  await assertFails(updateDoc(p, { sold: 11.5 }));
  await assertFails(updateDoc(p, { sold: increment(1), stock: 5 })); // cannot start tracking stock
  await assertFails(updateDoc(p, { sold: increment(1), price: 0 }));
});

test('stock: tablets move the stock count, nothing else on a product', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'kitchens', A, 'products', 'p1'), { stock: 20 }));
  await seedInvite('t1', unused()); await redeem('tab', 't1', A, 'tablet');
  const db = asKitchen('tab');
  const p = doc(db, 'kitchens', A, 'products', 'p1');
  await assertSucceeds(updateDoc(p, { stock: 18 }));
  await assertSucceeds(updateDoc(p, { stock: 20 }));
  await assertFails(updateDoc(p, { stock: 5000 }));
  await assertFails(updateDoc(p, { price: 1 }));
  await assertFails(updateDoc(p, { stock: 19, price: 1 }));
  await assertSucceeds(updateDoc(doc(asKitchen(A), 'kitchens', A, 'products', 'p1'), { price: 7, stock: null }));
  await assertFails(updateDoc(p, { stock: 3 })); // not tracked any more
});

// Resident self-view (#89).
test('resident link: the holder sees one resident and nothing else', async () => {
  const TOKEN = 'tok_' + 'x'.repeat(24);
  await assertSucceeds(setDoc(doc(asKitchen(A), 'residentLinks', TOKEN), { kitchenId: A, userId: 'u1', createdBy: A, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(asKitchen(A), 'residentLinks', 'short'), { kitchenId: A, userId: 'u1', createdBy: A, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(asKitchen(B), 'residentLinks', 'tok_' + 'y'.repeat(24)), { kitchenId: A, userId: 'u1', createdBy: B, createdAt: serverTimestamp() }));
  await seedInvite('t1', unused()); await redeem('tab', 't1', A, 'tablet');
  await assertFails(setDoc(doc(asKitchen('tab'), 'residentLinks', 'tok_' + 'z'.repeat(24)), { kitchenId: A, userId: 'u1', createdBy: 'tab', createdAt: serverTimestamp() }));

  const viewer = asKitchen('anon-viewer');
  await assertFails(getDocs(query(collection(viewer, 'kitchens', A, 'purchases'), where('userId', '==', 'u1'))));
  await assertFails(setDoc(doc(viewer, 'linkSessions', 'anon-viewer'), { token: 'no-such-token-xxxxxxxxxx' }));
  await assertSucceeds(setDoc(doc(viewer, 'linkSessions', 'anon-viewer'), { token: TOKEN }));
  await assertSucceeds(getDocs(query(collection(viewer, 'kitchens', A, 'purchases'), where('userId', '==', 'u1'))));
  await assertSucceeds(getDoc(doc(viewer, 'kitchens', A, 'users', 'u1')));
  // Everyone else's data stays closed.
  await assertFails(getDocs(collection(viewer, 'kitchens', A, 'purchases')));
  await assertFails(getDocs(query(collection(viewer, 'kitchens', A, 'purchases'), where('userId', '==', 'u2'))));
  await assertFails(getDoc(doc(viewer, 'kitchens', A, 'users', 'u2')));
  await assertFails(getDocs(collection(viewer, 'kitchens', A, 'users')));
  await assertFails(getDocs(collection(viewer, 'kitchens', A, 'products')));
  await assertFails(getDocs(query(collection(viewer, 'kitchens', B, 'purchases'), where('userId', '==', 'u1'))));
  await assertFails(addDoc(collection(viewer, 'kitchens', A, 'purchases'), purchase()));
  // Revoking the link ends access.
  await assertSucceeds(deleteDoc(doc(asKitchen(A), 'residentLinks', TOKEN)));
  await assertFails(getDocs(query(collection(viewer, 'kitchens', A, 'purchases'), where('userId', '==', 'u1'))));
});

// Food club: every member, tablets too, adds meals and signs up; other kitchens cannot.
test('food club: tablets add meals and sign up, other kitchens cannot see them', async () => {
  await seedInvite('t1', unused()); await redeem('tab', 't1', A, 'tablet');
  const db = asKitchen('tab');
  const eat = Timestamp.fromDate(new Date(Date.now() + 3 * 864e5));
  const meal = (day, extra = {}) => ({
    day, date: eat, closesAt: Timestamp.fromMillis(eat.toMillis() - 864e5), cooks: ['u1'], menu: 'Lasagne', notes: '',
    tags: ['meat', 'lactoseFree'], askCook: false, signups: ['u1'], createdAt: serverTimestamp(), ...extra,
  });
  const meals = collection(db, 'kitchens', A, 'meals');
  const ref = doc(meals, '2026-10-01');
  await assertSucceeds(setDoc(ref, meal('2026-10-01')));
  await assertSucceeds(setDoc(doc(meals, '2026-10-02'), meal('2026-10-02', { menu: '', tags: [] }))); // only the cook, details later
  // One meal a day: booking a taken day is refused, as are ids that are not the day.
  await assertFails(setDoc(ref, meal('2026-10-01', { cooks: ['u2'] })));
  await assertFails(setDoc(doc(meals, '2026-10-03'), meal('2026-10-04')));
  await assertFails(addDoc(meals, meal('2026-10-05')));
  await assertFails(updateDoc(ref, { day: '2026-10-06' }));
  // Moving a meal: the new day in the same batch as removing the old one, refused onto a taken day.
  const move = (to) => { const b = writeBatch(db); b.set(doc(meals, to), meal(to)); b.delete(doc(meals, '2026-10-02')); return b.commit(); };
  await assertFails(move('2026-10-01'));
  await assertSucceeds(move('2026-10-07'));
  await assertSucceeds(getDocs(query(meals, where('date', '>=', new Date()), where('date', '<', new Date(Date.now() + 7 * 864e5)), orderBy('date'), limit(50))));
  await assertSucceeds(updateDoc(ref, { signups: arrayUnion('u2') }));
  await assertSucceeds(updateDoc(ref, { signups: arrayRemove('u2') }));
  await assertSucceeds(updateDoc(ref, { cooks: arrayUnion('u2'), signups: arrayUnion('u2') })); // a second cook
  await assertFails(updateDoc(ref, { cooks: [] }));
  await assertSucceeds(updateDoc(ref, { menu: 'Lasagne og salat', askCook: true }));
  await assertFails(updateDoc(ref, { createdAt: Timestamp.now() }));
  await assertFails(updateDoc(ref, { extra: 1 }));
  await assertFails(updateDoc(ref, { menu: 'x'.repeat(201) }));
  await assertFails(updateDoc(ref, { closesAt: Timestamp.fromMillis(eat.toMillis() + 1) })); // closes after dinner
  await assertFails(setDoc(doc(meals, '2026-10-08'), meal('2026-10-08', { createdAt: Timestamp.now() })));
  await assertFails(setDoc(doc(meals, '2026-10-08'), meal('2026-10-08', { signups: 'u1' })));
  await assertFails(getDocs(collection(asKitchen(B), 'kitchens', A, 'meals')));
  await assertFails(setDoc(doc(asKitchen(B), 'kitchens', A, 'meals', '2026-10-08'), meal('2026-10-08')));
  await assertFails(getDocs(collection(anon(), 'kitchens', A, 'meals')));
  await assertSucceeds(deleteDoc(ref));
});

// Admin overview (ops/admin-stats.js writes it with the admin SDK).
test('admin stats: only admins read them, nobody writes them from the app', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'adminStats', 'latest'), { kitchens: [] }));
  await assertSucceeds(getDoc(doc(maker(), 'adminStats', 'latest')));
  await assertFails(getDoc(doc(asKitchen(A), 'adminStats', 'latest')));
  await assertFails(getDoc(doc(anon(), 'adminStats', 'latest')));
  await assertFails(setDoc(doc(maker(), 'adminStats', 'latest'), { kitchens: [] }));
  await assertFails(setDoc(doc(asKitchen(A), 'adminStats', 'latest'), { kitchens: [] }));
});

// Usage counts: every login of the kitchen adds to its own day, the tablet too; nobody reads them.
test('usage: kitchen logins count into their own kitchen, nobody reads', async () => {
  await seedInvite('u1', unused()); await assertSucceeds(redeem('utab', 'u1', A, 'tablet'));
  const day = doc(asKitchen(A), 'kitchens', A, 'usage', '2026-10-02');
  await assertSucceeds(setDoc(day, { m: { v: { buy: increment(1) }, h: { 21: increment(1) } } }, { merge: true }));
  await assertSucceeds(setDoc(doc(asKitchen('utab'), 'kitchens', A, 'usage', '2026-10-02'), { t: { a: { buy: increment(2) } } }, { merge: true }));
  await assertFails(getDoc(day));
  await assertFails(setDoc(day, { x: 1 }, { merge: true }));
  await assertFails(setDoc(day, { t: 5 }, { merge: true }));
  await assertFails(setDoc(doc(asKitchen(A), 'kitchens', A, 'usage', 'whenever'), { t: {} }));
  await assertFails(setDoc(doc(asKitchen(A), 'kitchens', B, 'usage', '2026-10-02'), { t: {} }));
  await assertFails(setDoc(doc(anon(), 'kitchens', A, 'usage', '2026-10-02'), { t: {} }));
  await assertFails(deleteDoc(day));
});

// Build reporting: each login writes only its own entry, nobody reads them from the app.
// The pulse: kitchens move a kind's time to the server's time; nothing else, no resident links.
test('pulse: logins stamp the server time, nothing else', async () => {
  const pulse = db => doc(db, 'pulse', 'kollegiet');
  await assertSucceeds(setDoc(pulse(asKitchen(A)), { kudos: serverTimestamp() }, { merge: true }));
  await assertSucceeds(setDoc(pulse(asKitchen(B)), { posts: serverTimestamp(), events: serverTimestamp() }, { merge: true }));
  await assertSucceeds(getDoc(pulse(asKitchen(B))));
  await assertFails(setDoc(pulse(asKitchen(A)), { kudos: Timestamp.fromMillis(Date.now() + 864e5) }, { merge: true }));
  await assertFails(setDoc(pulse(asKitchen(A)), { other: serverTimestamp() }, { merge: true }));
  await assertFails(setDoc(doc(asKitchen(A), 'pulse', 'elsewhere'), { kudos: serverTimestamp() }));
  await assertFails(setDoc(pulse(anon()), { kudos: serverTimestamp() }, { merge: true }));
  await assertFails(getDoc(pulse(anon())));
  await assertFails(deleteDoc(pulse(asKitchen(A))));
});

test('app versions: a login reports its own build, nothing else', async () => {
  const mine = doc(asKitchen(A), 'kitchens', A, 'appVersions', A);
  await assertSucceeds(setDoc(mine, { build: 'PJ72EFS3', loadedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(mine, { build: 'NEW12345', loadedAt: serverTimestamp() }));
  await assertFails(getDoc(mine));
  await assertFails(setDoc(mine, { build: 'x', loadedAt: Timestamp.fromMillis(Date.now() - 60e3) }));
  await assertFails(setDoc(mine, { build: 'x', loadedAt: serverTimestamp(), extra: 1 }));
  await assertFails(setDoc(doc(asKitchen(A), 'kitchens', A, 'appVersions', 'someoneElse'), { build: 'x', loadedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(asKitchen(A), 'kitchens', B, 'appVersions', A), { build: 'x', loadedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(asKitchen('ghost'), 'kitchens', 'ghost', 'appVersions', 'ghost'), { build: 'x', loadedAt: serverTimestamp() }));
  await assertFails(deleteDoc(mine));
});
