// Kollegiet (docs/kollegiet.md): kitchens together, never as another kitchen, resident links kept out.
const { test, before, after, beforeEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const {
  doc, collection, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy, limit,
  Timestamp, serverTimestamp, writeBatch, increment, deleteField,
} = require('firebase/firestore');

let env;
const A = 'kitchenA';
const B = 'kitchenB';
const C = 'kitchenC';
const H = 3600e3;
const ts = ms => Timestamp.fromMillis(ms);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kollegiet',
    firestore: { rules: fs.readFileSync(process.env.RULES || path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins', 'maker'), {});
    for (const [k, name] of [[A, 'Ny2'], [B, 'Gl4'], [C, 'M7']]) {
      await setDoc(doc(db, 'kitchens', k), { id: k, name });
    }
    // A tablet of A that joined with an invite.
    await setDoc(doc(db, 'memberships', 'tabA'), { kitchenId: A, role: 'tablet', invite: 'x', joinedAt: Timestamp.now() });
    await setDoc(doc(db, 'kitchens', A, 'members', 'tabA'), { role: 'tablet', email: 't@x', joinedAt: Timestamp.now() });
    // A live battle A started against everyone, B has joined; one ended; one gym battle.
    const now = Date.now();
    await setDoc(doc(db, 'battles', 'live'), {
      kitchenId: A, title: 'Fredagsøl', metric: 'beer', from: ts(now - H), to: ts(now + H), invited: 'all',
      participants: [A, B], createdAt: ts(now - 2 * H),
    });
    await setDoc(doc(db, 'battles', 'over'), {
      kitchenId: A, title: 'Gammel', metric: 'drinks', from: ts(now - 5 * H), to: ts(now - H), invited: 'all',
      participants: [A, B], createdAt: ts(now - 6 * H),
    });
    await setDoc(doc(db, 'battles', 'gym'), {
      kitchenId: B, title: 'Fitness', metric: 'gym', from: ts(now - H), to: ts(now + H), invited: [A],
      participants: [B, A], createdAt: ts(now - 2 * H),
    });
    await setDoc(doc(db, 'polls', `${B}_2026-10`), {
      kitchenId: B, title: 'Bedst til genbrug', opensAt: ts(now - H), closesAt: ts(now + 24 * H), createdAt: ts(now - H),
    });
    await setDoc(doc(db, 'posts', 'p1'), { kitchenId: B, text: 'Hej alle', to: null, parentId: null, createdAt: ts(now - 10 * 60e3) });
  });
});

const as = uid => env.authenticatedContext(uid).firestore();
const asAnonymous = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const out = () => env.unauthenticatedContext().firestore();

function post(db, kitchenId, extra = {}) {
  const b = writeBatch(db);
  b.set(doc(collection(db, 'posts')), { kitchenId, text: 'Åbent køkken i aften!', to: null, parentId: null, createdAt: serverTimestamp(), ...extra });
  b.set(doc(db, 'seen', kitchenId), { lastPostAt: serverTimestamp() }, { merge: true });
  return b.commit();
}

test('kitchen logins read Kollegiet; resident links and outsiders do not', async () => {
  for (const db of [as(A), as('tabA'), as(B)]) {
    await assertSucceeds(getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50))));
    await assertSucceeds(getDocs(collection(db, 'battles')));
    await assertSucceeds(getDocs(collection(db, 'battles', 'live', 'tally')));
  }
  // An anonymous login whose uid is not a kitchen, and one that happens to match a kitchen id.
  await assertFails(getDocs(collection(asAnonymous('linkUser'), 'posts')));
  await assertFails(getDocs(collection(asAnonymous(C), 'posts')));
  await assertFails(getDocs(collection(out(), 'posts')));
  // A login without a kitchen.
  await assertFails(getDocs(collection(as('stranger'), 'posts')));
});

test('posts: as the own kitchen only, with the rate limit, replies and direct posts', async () => {
  await assertSucceeds(post(as('tabA'), A));
  // Too soon after the last one.
  await assertFails(post(as(A), A));
  // As another kitchen.
  await assertFails(post(as(C), B));
  // Without moving the rate limit.
  await assertFails(addDoc(collection(as(C), 'posts'), { kitchenId: C, text: 'x', to: null, parentId: null, createdAt: serverTimestamp() }));
  await assertSucceeds(post(as(C), C, { parentId: 'p1' }));
  await assertSucceeds(post(as(B), B, { to: A }));
  await assertFails(post(as(B), B, { text: '' }));
});

test('posts: the author takes back for five minutes; managers and the maker hide', async () => {
  await assertSucceeds(deleteDoc(doc(as(B), 'posts', 'p1')));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'posts', 'old'),
    { kitchenId: A, text: 'x', to: null, parentId: null, createdAt: ts(Date.now() - H) }));
  // The tablet cannot hide after five minutes; the owner and the maker can; another kitchen cannot.
  await assertFails(deleteDoc(doc(as('tabA'), 'posts', 'old')));
  await assertFails(deleteDoc(doc(as(B), 'posts', 'old')));
  await assertSucceeds(setDoc(doc(as(A), 'hidden', 'old'), { collection: 'posts', kitchenId: A, data: { text: 'x' }, hiddenAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(as('maker'), 'posts', 'old')));
  await assertFails(setDoc(doc(as(B), 'hidden', 'x'), { collection: 'posts', kitchenId: A, data: {}, hiddenAt: serverTimestamp() }));
});

test('events: the author edits, other kitchens only answer for themselves', async () => {
  const now = Date.now();
  const e = { kitchenId: A, kind: 'openKitchen', title: 'Åbent køkken', text: '', place: 'Ny2', startsAt: ts(now + H), endsAt: ts(now + 4 * H),
    invited: 'all', rsvp: {}, createdAt: serverTimestamp() };
  const ref = await assertSucceeds(addDoc(collection(as('tabA'), 'events'), e));
  await assertFails(addDoc(collection(as(B), 'events'), e));
  await assertSucceeds(updateDoc(doc(as(B), 'events', ref.id), { [`rsvp.${B}`]: 'yes' }));
  await assertFails(updateDoc(doc(as(B), 'events', ref.id), { [`rsvp.${C}`]: 'yes' }));
  await assertFails(updateDoc(doc(as(B), 'events', ref.id), { title: 'Mit nu' }));
  await assertSucceeds(updateDoc(doc(as(A), 'events', ref.id), { title: 'Åbent køkken med DJ' }));
  await assertFails(updateDoc(doc(as(A), 'events', ref.id), { [`rsvp.${B}`]: deleteField() }));
  await assertSucceeds(updateDoc(doc(as(B), 'events', ref.id), { [`rsvp.${B}`]: deleteField() }));
});

test('battles: create as yourself, join only yourself, once, while not over', async () => {
  const now = Date.now();
  const b = { kitchenId: C, title: 'Mest madklub', metric: 'mealDiners', from: ts(now + H), to: ts(now + 24 * H), invited: 'all',
    participants: [C], createdAt: serverTimestamp() };
  const ref = await assertSucceeds(addDoc(collection(as(C), 'battles'), b));
  await assertFails(addDoc(collection(as(C), 'battles'), { ...b, participants: [C, A] }));
  await assertFails(addDoc(collection(as(C), 'battles'), { ...b, kitchenId: A, participants: [A] }));
  await assertFails(addDoc(collection(as(C), 'battles'), { ...b, to: ts(now + 40 * 24 * H) }));
  await assertSucceeds(updateDoc(doc(as('tabA'), 'battles', ref.id), { participants: [C, A] }));
  await assertFails(updateDoc(doc(as(A), 'battles', ref.id), { participants: [C, A, A] }));
  await assertFails(updateDoc(doc(as(A), 'battles', ref.id), { participants: [C, A, B] }));
  await assertFails(updateDoc(doc(as(C), 'battles', 'over'), { participants: [A, B, C] }));
  // Gym was for A only.
  await assertFails(updateDoc(doc(as(C), 'battles', 'gym'), { participants: [B, A, C] }));
});

test('tally: own kitchen, while live, at most 400 a write; gym one tap at a time', async () => {
  const tally = (db, battle, kid, value) => setDoc(doc(db, 'battles', battle, 'tally', kid),
    { value, ticks: [{ at: Timestamp.now(), n: value }], updatedAt: serverTimestamp() });
  await assertSucceeds(tally(as('tabA'), 'live', A, 12));
  await assertSucceeds(updateDoc(doc(as('tabA'), 'battles', 'live', 'tally', A), { value: increment(6), updatedAt: serverTimestamp() }));
  await assertFails(tally(as(A), 'live', B, 3));
  await assertFails(tally(as(C), 'live', C, 3));
  await assertFails(updateDoc(doc(as(A), 'battles', 'live', 'tally', A), { value: increment(500), updatedAt: serverTimestamp() }));
  await assertFails(tally(as(A), 'over', A, 3));
  await assertFails(tally(asAnonymous(A), 'live', A, 3));
  await assertSucceeds(tally(as(A), 'gym', A, 1));
  await assertFails(updateDoc(doc(as(A), 'battles', 'gym', 'tally', A), { value: increment(1), updatedAt: serverTimestamp() }));
  await assertFails(tally(as(B), 'gym', B, 2));
});

test('live achievements: only when the tally has earned them', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'battles', 'live', 'tally', A), { value: 60, ticks: [], updatedAt: Timestamp.now() }));
  const claim = (db, kid, code, battle = 'live') => setDoc(doc(db, 'standings', kid, 'achievements', code), { battle, at: serverTimestamp() });
  await assertSucceeds(claim(as('tabA'), A, 'beer50'));
  await assertSucceeds(claim(as(A), A, 'firstBattle'));
  await assertFails(claim(as(A), A, 'beer100'));
  await assertFails(claim(as(A), A, 'drinks100'));
  await assertFails(claim(as(B), B, 'firstBattle'));
  await assertFails(claim(as(B), A, 'firstBattle'));
  await assertFails(claim(as(A), A, 'madeUp'));
});

test('kudos: from yourself to another kitchen, one high-five a pair a day', async () => {
  const k = { from: A, to: B, kind: 'highfive', badge: null, reason: '', createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as('tabA'), 'kudos', `${A}_${B}_2026-10-01`), k));
  await assertFails(setDoc(doc(as(A), 'kudos', `${A}_${B}_2026-10-01`), k));
  await assertFails(setDoc(doc(as(A), 'kudos', `whatever`), k));
  await assertFails(setDoc(doc(as(A), 'kudos', `${A}_${A}_2026-10-01`), { ...k, to: A }));
  await assertFails(setDoc(doc(as(C), 'kudos', `${A}_${B}_2026-10-02`), k));
  const badge = { from: A, to: B, kind: 'badge', badge: 'goodFriends', reason: 'Lånte os en grill', createdAt: serverTimestamp() };
  await assertSucceeds(addDoc(collection(as(A), 'kudos'), badge));
  await assertFails(addDoc(collection(as(A), 'kudos'), { ...badge, badge: 'invented' }));
  await assertFails(addDoc(collection(as(A), 'kudos'), { ...badge, reason: '' }));
});

test('polls: one a month per kitchen; ballots are secret and not for yourself', async () => {
  const now = Date.now();
  const p = { kitchenId: A, title: 'Mest plantebaseret', opensAt: ts(now), closesAt: ts(now + 7 * 24 * H), createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as('tabA'), 'polls', `${A}_2026-10`), p));
  await assertFails(setDoc(doc(as(A), 'polls', `${B}_2026-11`), p));
  await assertFails(setDoc(doc(as(A), 'polls', `${A}_2026-11`), { ...p, closesAt: ts(now + 60 * 24 * H) }));
  const poll = `${B}_2026-10`;
  await assertSucceeds(setDoc(doc(as('tabA'), 'polls', poll, 'ballots', A), { choice: C, at: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(as(A), 'polls', poll, 'ballots', A), { choice: B, at: serverTimestamp() }));
  await assertFails(setDoc(doc(as(A), 'polls', poll, 'ballots', A), { choice: A, at: serverTimestamp() }));
  await assertFails(setDoc(doc(as(A), 'polls', poll, 'ballots', C), { choice: B, at: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(as(A), 'polls', poll, 'ballots', A)));
  await assertFails(getDoc(doc(as(B), 'polls', poll, 'ballots', A)));
  await assertFails(getDocs(collection(as(B), 'polls', poll, 'ballots')));
  await assertFails(getDoc(doc(as('maker'), 'polls', poll, 'ballots', A)));
});

test('profiles: managers edit their own; tablets and other kitchens do not', async () => {
  const p = { emoji: '🍺', colour: 'teal', bio: 'Vi har den bedste altan', updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as(A), 'profiles', A), p));
  await assertFails(setDoc(doc(as('tabA'), 'profiles', A), p));
  await assertFails(setDoc(doc(as(B), 'profiles', A), p));
  await assertFails(setDoc(doc(as(A), 'profiles', A), { ...p, colour: 'neon' }));
});

test('reports go to the maker only; standings are written by the job only', async () => {
  await assertSucceeds(addDoc(collection(as('tabA'), 'reports'), { kitchenId: A, target: 'posts/p1', text: '', createdAt: serverTimestamp() }));
  await assertFails(getDocs(collection(as(A), 'reports')));
  await assertSucceeds(getDocs(collection(as('maker'), 'reports')));
  await assertFails(setDoc(doc(as(A), 'standings', A), { wins: 99 }));
});

test('seen: the kitchen stamps when it last looked at Kollegiet and Aktuelt, with the server time', async () => {
  await assertSucceeds(setDoc(doc(as('tabA'), 'seen', A), { aktueltAt: serverTimestamp() }, { merge: true }));
  await assertSucceeds(setDoc(doc(as(A), 'seen', A), { kollegietAt: serverTimestamp() }, { merge: true }));
  await assertFails(setDoc(doc(as(A), 'seen', A), { aktueltAt: ts(Date.now() + 864e5) }, { merge: true }));
  await assertFails(setDoc(doc(as(B), 'seen', A), { aktueltAt: serverTimestamp() }, { merge: true }));
  await assertFails(setDoc(doc(asAnonymous('link1'), 'seen', A), { aktueltAt: serverTimestamp() }, { merge: true }));
  await assertFails(setDoc(doc(as(A), 'seen', A), { other: 1 }, { merge: true }));
});
