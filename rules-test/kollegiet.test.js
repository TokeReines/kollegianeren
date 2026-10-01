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
// Today and this month as a tablet names them (the rules allow Danish time, a few hours ahead of UTC).
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

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

function post(db, kitchenId, extra = {}, count = 1) {
  const b = writeBatch(db);
  let ref;
  for (let i = 0; i < count; i++) {
    ref = doc(collection(db, 'posts'));
    b.set(ref, { kitchenId, text: 'Åbent køkken i aften!', to: null, parentId: null, createdAt: serverTimestamp(), ...extra });
  }
  b.set(doc(db, 'seen', kitchenId), { lastPostAt: serverTimestamp(), lastPostId: ref.id }, { merge: true });
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
  // Several posts in one batch, past the rate limit together.
  await assertFails(post(as('tabA'), A, {}, 3));
});

test('posts: the author takes back for five minutes; managers and the maker hide', async () => {
  await assertSucceeds(deleteDoc(doc(as(B), 'posts', 'p1')));
  const old = { kitchenId: A, text: 'x', to: null, parentId: null, createdAt: ts(Date.now() - H) };
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'posts', 'old'), old);
    await setDoc(doc(ctx.firestore(), 'posts', 'old2'), old);
  });
  // The tablet cannot hide after five minutes; the owner and the maker can; another kitchen cannot.
  await assertFails(deleteDoc(doc(as('tabA'), 'posts', 'old')));
  await assertFails(deleteDoc(doc(as(B), 'posts', 'old')));
  const hide = (db, hiddenId, data, { kitchenId = A, remove = 'old' } = {}) => {
    const b = writeBatch(db);
    b.set(doc(db, 'hidden', hiddenId), { collection: 'posts', kitchenId, data, hiddenAt: serverTimestamp() });
    if (remove) b.delete(doc(db, 'posts', remove));
    return b.commit();
  };
  // Made-up copies: other text, under another id, the original left in place, another author.
  await assertFails(hide(as(A), 'posts_old', { ...old, text: 'something B never wrote' }));
  await assertFails(hide(as(A), 'posts_other', old));
  await assertFails(hide(as(A), 'posts_old', old, { remove: null }));
  await assertFails(hide(as(B), 'posts_old', old, { kitchenId: B }));
  await assertSucceeds(hide(as(A), 'posts_old', old));
  await assertSucceeds(deleteDoc(doc(as('maker'), 'posts', 'old2')));
  await assertFails(setDoc(doc(as(B), 'hidden', 'x'), { collection: 'posts', kitchenId: A, data: {}, hiddenAt: serverTimestamp() }));
});

test('events: a live call is one per kitchen at a time, to everyone, three hours at most', async () => {
  const now = Date.now();
  const e = { kitchenId: A, kind: 'live', title: 'Kom over', text: '', place: 'Ny2', startsAt: ts(now), endsAt: ts(now + 2 * H),
    invited: 'all', rsvp: {}, createdAt: serverTimestamp() };
  const mine = doc(as(A), 'events', `live_${A}`);
  // Only as the kitchen's own document, to everyone, starting now, three hours at most.
  await assertFails(addDoc(collection(as(A), 'events'), e));
  await assertFails(setDoc(doc(as(A), 'events', `live_${B}`), e));
  await assertFails(setDoc(mine, { ...e, endsAt: ts(now + 4 * H) }));
  await assertFails(setDoc(mine, { ...e, invited: [B] }));
  await assertFails(setDoc(mine, { ...e, startsAt: ts(now + H), endsAt: ts(now + 2 * H) }));
  await assertFails(setDoc(mine, { ...e, kind: 'party' }));
  await assertSucceeds(setDoc(mine, e));
  // Answers, ending early; not longer, not moved, not deleted, not called again soon.
  await assertSucceeds(updateDoc(doc(as(B), 'events', `live_${A}`), { [`rsvp.${B}`]: 'yes' }));
  await assertFails(updateDoc(mine, { endsAt: ts(now + 3 * H) }));
  await assertFails(updateDoc(mine, { startsAt: ts(now + 10 * 60e3) }));
  // Not a second one while it goes on.
  await assertFails(setDoc(mine, { ...e, startsAt: ts(Date.now()), endsAt: ts(Date.now() + H) }));
  await assertFails(deleteDoc(mine));
  // Ended early (not later than set, so ending twice is harmless): a new call straight away, with no answers.
  await assertSucceeds(updateDoc(mine, { endsAt: ts(now + 1) }));
  await assertSucceeds(updateDoc(mine, { endsAt: ts(now + 1) }));
  await assertFails(updateDoc(mine, { endsAt: ts(now + 2) }));
  await assertFails(setDoc(mine, { ...e, startsAt: ts(Date.now()), rsvp: { [B]: 'yes' } }));
  await assertSucceeds(setDoc(mine, { ...e, startsAt: ts(Date.now()), endsAt: ts(Date.now() + H) }));
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
  // Only invited kitchens answer an event for a few.
  const few = await assertSucceeds(addDoc(collection(as(A), 'events'), { ...e, invited: [B] }));
  await assertSucceeds(updateDoc(doc(as(B), 'events', few.id), { [`rsvp.${B}`]: 'maybe' }));
  await assertFails(updateDoc(doc(as(C), 'events', few.id), { [`rsvp.${C}`]: 'yes' }));
});

// A battle takes one of its kitchen's three places in the same batch.
function startBattle(db, kid, id, slot, b) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'battles', id), b);
  batch.set(doc(db, 'battleSlots', kid), { [slot]: id }, { merge: true });
  return batch.commit();
}

test('battles: create as yourself, join only yourself, once, while not over', async () => {
  const now = Date.now();
  const b = { kitchenId: C, title: 'Mest madklub', metric: 'mealDiners', from: ts(now + H), to: ts(now + 24 * H), invited: 'all',
    participants: [C], createdAt: serverTimestamp() };
  await assertFails(addDoc(collection(as(C), 'battles'), b));
  await assertSucceeds(startBattle(as(C), C, 'mine', 's1', b));
  const ref = { id: 'mine' };
  await assertFails(startBattle(as(C), C, 'x1', 's2', { ...b, participants: [C, A] }));
  await assertFails(startBattle(as(C), C, 'x2', 's2', { ...b, kitchenId: A, participants: [A] }));
  await assertFails(startBattle(as(C), A, 'x3', 's2', { ...b, kitchenId: A, participants: [A] }));
  await assertFails(startBattle(as(C), C, 'x4', 's2', { ...b, to: ts(now + 40 * 24 * H) }));
  await assertSucceeds(updateDoc(doc(as('tabA'), 'battles', ref.id), { participants: [C, A] }));
  await assertFails(updateDoc(doc(as(A), 'battles', ref.id), { participants: [C, A, A] }));
  await assertFails(updateDoc(doc(as(A), 'battles', ref.id), { participants: [C, A, B] }));
  await assertFails(updateDoc(doc(as(C), 'battles', 'over'), { participants: [A, B, C] }));
  // Gym was for A only.
  await assertFails(updateDoc(doc(as(C), 'battles', 'gym'), { participants: [B, A, C] }));
});

test('battles: three on or coming per kitchen that started them', async () => {
  const now = Date.now();
  const b = { kitchenId: C, title: 'Fredagsøl', metric: 'beer', from: ts(now + H), to: ts(now + 24 * H), invited: 'all',
    participants: [C], createdAt: serverTimestamp() };
  await assertSucceeds(startBattle(as(C), C, 'b1', 's1', b));
  await assertSucceeds(startBattle(as(C), C, 'b2', 's2', b));
  await assertSucceeds(startBattle(as(C), C, 'b3', 's3', b));
  await assertFails(startBattle(as(C), C, 'b4', 's1', b));
  await assertFails(startBattle(as(C), C, 'b4', 's4', b));
  // Called off before it started: its place is free.
  await assertSucceeds(deleteDoc(doc(as(C), 'battles', 'b2')));
  await assertSucceeds(startBattle(as(C), C, 'b4', 's2', b));
  // Ended: free as well.
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'battles', 'b3'), { from: ts(now - 3 * H), to: ts(now - H) }));
  await assertSucceeds(startBattle(as(C), C, 'b5', 's3', b));
  await assertFails(startBattle(as(C), C, 'b6', 's1', b));
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
  // Gym has no total.
  await assertFails(setDoc(doc(as(B), 'battles', 'gym', 'tally', B), { value: 1, total: 50, ticks: [], updatedAt: serverTimestamp() }));
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
  await assertSucceeds(setDoc(doc(as('tabA'), 'kudos', `${A}_${B}_${today()}`), k));
  await assertFails(setDoc(doc(as(A), 'kudos', `${A}_${B}_${today()}`), k));
  await assertFails(setDoc(doc(as(A), 'kudos', `whatever`), k));
  await assertFails(setDoc(doc(as(A), 'kudos', `${A}_${A}_${today()}`), { ...k, to: A }));
  await assertFails(setDoc(doc(as(C), 'kudos', `${A}_${C}_${today()}`), { ...k, to: C }));
  // Another day than today: more high-fives than one a day.
  await assertFails(setDoc(doc(as(A), 'kudos', `${A}_${C}_2031-01-01`), { ...k, to: C }));
  await assertFails(setDoc(doc(as(A), 'kudos', `${A}_${C}_2020-01-01`), { ...k, to: C }));
  const badge = { from: A, to: B, kind: 'badge', badge: 'goodFriends', reason: 'Lånte os en grill', createdAt: serverTimestamp() };
  await assertSucceeds(addDoc(collection(as(A), 'kudos'), badge));
  await assertFails(addDoc(collection(as(A), 'kudos'), { ...badge, badge: 'invented' }));
  await assertFails(addDoc(collection(as(A), 'kudos'), { ...badge, reason: '' }));
});

test('polls: two open at a time per kitchen, ended early by it; ballots are secret and not for yourself', async () => {
  const now = Date.now();
  const p = { kitchenId: A, title: 'Mest plantebaseret', opensAt: ts(now), closesAt: ts(now + 7 * 24 * H), createdAt: serverTimestamp() };
  // A poll takes one of the kitchen's two places in the same batch.
  const start = (db, id, slot, extra = {}, slotsKid = A) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'polls', id), { ...p, ...extra });
    batch.set(doc(db, 'pollSlots', slotsKid), { [slot]: id }, { merge: true });
    return batch.commit();
  };
  await assertFails(setDoc(doc(as(A), 'polls', 'alone'), p));
  await assertFails(start(as(A), 'other', 's1', { kitchenId: B }));
  await assertFails(start(as(A), 'theirs', 's1', {}, B));
  await assertFails(start(as(A), 'long', 's1', { closesAt: ts(now + 60 * 24 * H) }));
  await assertFails(start(as(A), 'third-place', 's3'));
  await assertSucceeds(start(as('tabA'), 'one', 's1'));
  await assertSucceeds(start(as(A), 'two', 's2'));
  // Both places hold an open poll: no third.
  await assertFails(start(as(A), 'three', 's1'));
  await assertFails(start(as(A), 'three', 's2'));
  await assertFails(setDoc(doc(as(A), 'pollSlots', A), { s1: 'two' }, { merge: true }));
  // Its kitchen ends one early: closed now, or cancelled; nobody else, nothing else, not twice.
  await assertFails(updateDoc(doc(as(B), 'polls', 'one'), { closesAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as(A), 'polls', 'one'), { title: 'Noget andet' }));
  await assertFails(updateDoc(doc(as(A), 'polls', 'one'), { closesAt: ts(now + 3 * 24 * H) }));
  await assertSucceeds(updateDoc(doc(as('tabA'), 'polls', 'one'), { closesAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as(A), 'polls', 'one'), { closesAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(as(A), 'polls', 'two'), { closesAt: serverTimestamp(), cancelled: true }));
  await assertFails(setDoc(doc(as(B), 'polls', 'two', 'ballots', B), { choice: C, at: serverTimestamp() }));
  // A closed one's place takes a new poll.
  await assertSucceeds(start(as(A), 'three', 's1'));
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

test('reports come from the league job only, for the maker; standings are written by the job only', async () => {
  await assertFails(addDoc(collection(as('tabA'), 'reports'), { kitchenId: A, target: 'posts/p1', text: '', createdAt: serverTimestamp() }));
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

test('proposals: only the maker writes them; kitchens give their own thumbs up and comment, slowly', async () => {
  const p = { title: 'Udgifter i madklubben', body: 'Kokken lægger udgifter ind', images: ['dev/x'], status: 'open', votes: {},
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), statusAt: serverTimestamp() };
  await assertFails(setDoc(doc(as(A), 'proposals', 'p'), p));
  await assertSucceeds(setDoc(doc(as('maker'), 'proposals', 'p'), p));
  await assertSucceeds(getDoc(doc(as('tabA'), 'proposals', 'p')));
  // Thumbs up: own only, on and off; nothing else.
  await assertSucceeds(updateDoc(doc(as('tabA'), 'proposals', 'p'), { [`votes.${A}`]: true }));
  await assertFails(updateDoc(doc(as(B), 'proposals', 'p'), { [`votes.${A}`]: deleteField() }));
  await assertFails(updateDoc(doc(as(B), 'proposals', 'p'), { [`votes.${B}`]: false }));
  await assertFails(updateDoc(doc(as(B), 'proposals', 'p'), { status: 'done' }));
  await assertSucceeds(updateDoc(doc(as(B), 'proposals', 'p'), { [`votes.${B}`]: true }));
  await assertSucceeds(updateDoc(doc(as(B), 'proposals', 'p'), { [`votes.${B}`]: deleteField() }));
  // The maker moves it along, but cannot touch the votes.
  await assertSucceeds(updateDoc(doc(as('maker'), 'proposals', 'p'), { status: 'planned', statusAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('maker'), 'proposals', 'p'), { votes: {}, updatedAt: serverTimestamp() }));
  // Comments: a kitchen's own, text only, with the post rate limit; the maker's with pictures.
  const comment = (db, kid, extra = {}) => {
    const batch = writeBatch(db);
    const ref = doc(collection(db, 'proposals', 'p', 'comments'));
    batch.set(ref, { from: kid, text: 'Ja tak', images: [], createdAt: serverTimestamp(), ...extra });
    batch.set(doc(db, 'seen', kid), { lastPostAt: serverTimestamp(), lastPostId: ref.id }, { merge: true });
    return batch.commit();
  };
  await assertFails(comment(as(A), B));
  await assertFails(comment(as(A), A, { images: ['dev/y'] }));
  await assertSucceeds(comment(as(A), A));
  await assertFails(comment(as(A), A));
  await assertFails(addDoc(collection(as(A), 'proposals', 'p', 'comments'), { from: A, text: 'Uden grænse', images: [], createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(as(A), 'proposals', 'p', 'comments'), { from: 'maker', text: 'Toke her', images: [], createdAt: serverTimestamp() }));
  await assertSucceeds(addDoc(collection(as('maker'), 'proposals', 'p', 'comments'), { from: 'maker', text: 'Tak!', images: ['dev/z'], createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(as(B), 'proposals', 'nope', 'comments'), { from: B, text: 'x', images: [], createdAt: serverTimestamp() }));
});

