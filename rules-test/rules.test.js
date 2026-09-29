// Replays every Firestore call the app makes (src/app/services/*) against firestore.rules,
// and checks that kitchens cannot reach each other's data.
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment, assertSucceeds, assertFails,
} = require('@firebase/rules-unit-testing');
const {
  doc, collection, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, Timestamp, serverTimestamp,
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
    for (const k of [A, B]) {
      await setDoc(doc(db, 'kitchens', k), { id: k, name: k === A ? 'Ny2' : 'Gl4' });
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
test('a new kitchen can create its own kitchen doc', async () => {
  await assertSucceeds(setDoc(doc(asKitchen('newKitchen'), 'kitchens', 'newKitchen'), { id: 'newKitchen', name: 'm6' }));
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
const change = { products: { name: 'changed' }, users: { name: 'changed' }, purchases: { amount: 2 } };

for (const sub of ['products', 'users', 'purchases']) {
  test(`own kitchen: full CRUD on ${sub}`, async () => {
    const db = asKitchen(A);
    await assertSucceeds(getDocs(collection(db, 'kitchens', A, sub)));
    const ref = await assertSucceeds(addDoc(collection(db, 'kitchens', A, sub), sample[sub]()));
    await assertSucceeds(updateDoc(doc(db, 'kitchens', A, sub, ref.id), change[sub]));
    await assertSucceeds(deleteDoc(doc(db, 'kitchens', A, sub, ref.id)));
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
test('purchases: updates cannot move the timestamp', async () => {
  const db = asKitchen(A);
  await assertFails(updateDoc(doc(db, 'kitchens', A, 'purchases', 'x1'), { timestamp: Timestamp.fromDate(new Date('2020-01-01')) }));
  await assertSucceeds(updateDoc(doc(db, 'kitchens', A, 'purchases', 'x1'), { amount: 3 }));
});
test('kitchen doc: only {id, name} with id == uid', async () => {
  await assertFails(setDoc(doc(asKitchen('k2'), 'kitchens', 'k2'), { id: 'k2', name: 'x', admin: true }));
  await assertFails(setDoc(doc(asKitchen('k2'), 'kitchens', 'k2'), { id: 'other', name: 'x' }));
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
