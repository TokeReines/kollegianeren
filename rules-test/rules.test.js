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
for (const sub of ['products', 'users', 'purchases']) {
  test(`own kitchen: full CRUD on ${sub}`, async () => {
    const db = asKitchen(A);
    await assertSucceeds(getDocs(collection(db, 'kitchens', A, sub)));
    const ref = await assertSucceeds(addDoc(collection(db, 'kitchens', A, sub), { name: 'new' }));
    await assertSucceeds(updateDoc(doc(db, 'kitchens', A, sub, ref.id), { name: 'changed' }));
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
