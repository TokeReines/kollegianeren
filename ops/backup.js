#!/usr/bin/env node
// Quota-aware Firestore backup for the free Spark plan (50k reads/day, hard cap).
//
//   node backup.js --project prod [--out DIR] [--max-reads 8000] [--backfill-reads 5000]
//                  [--ceiling 35000] [--keep-days 365] [--chunk 500]
//                  [--before-reset MINUTES]  (only run if the quota day ends within MINUTES)
//
// The backups are for invoicing, which looks back a quarter or so, so only the last --keep-days
// of purchases are kept. Every run:
//   1. Snapshots the small collections (kitchen docs, users, products) into snapshots/<date>/,
//      and Kollegiet (posts, events, kudos, battles, polls, profiles, standings, proposals and
//      their subcollections) into kollegiet/, only what can still have changed since the last
//      run (snapshotKollegiet). A few dozen reads a night.
//   2. Pulls new purchases per kitchen since the newest one already backed up, and the ids of
//      purchases taken back since the last run (the app's notes in removed/).
//   3. Backfills older purchases within the window, newest first, round-robin across kitchens,
//      resuming from a cursor stored in state.json, with at most --backfill-reads of the budget.
//   4. Drops backed-up purchases that have fallen out of the window (lib/prune.js).
//   5. Anonymises, in the backup files, residents the kitchen has anonymised since (lib/scrub.js).
// It stops before this run's reads pass --max-reads, or before the project's reads for the
// quota day pass --ceiling, so the kitchens always keep headroom. Once backfilled, a night
// costs about 1.5k reads (the snapshot and the day's purchases).
//
// Limitations: purchases edited in place (same timestamp) are not re-read, and ones deleted
// without the app's note (by an ops script) stay in the files. Once backfill is done, a weekly
// count() per kitchen flags mismatches.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { FieldPath, Timestamp } = require('firebase-admin/firestore');
const { init, parseArgs } = require('./lib/firebase');
const { encode } = require('./lib/codec');
const { usedToday, pacificMidnight } = require('./lib/quota');
const { scrubAnonymised } = require('./lib/scrub');
const { prunePurchases } = require('./lib/prune');

const args = parseArgs();
const { projectId, db, accessToken } = init(args.project);
const OUT = path.resolve(args.out || path.join(os.homedir(), 'kollegianeren-backups', projectId));
const MAX_READS = +(args['max-reads'] || 8000);
const BACKFILL_READS = +(args['backfill-reads'] || 5000);
const KEEP_DAYS = +(args['keep-days'] || 365);
const cutoff = Timestamp.fromMillis(Date.now() - KEEP_DAYS * 864e5);
const CEILING = +(args.ceiling || 35000);
const CHUNK = +(args.chunk || 500);
const KEEP_SNAPSHOTS = +(args['keep-snapshots'] || 30);
const runId = new Date().toISOString().replace(/[:.]/g, '-');

let reads = 0;
let lastQuotaCheck = { at: 0, used: 0, readsAtCheck: 0 };

function log(...m) { console.log(new Date().toISOString(), ...m); }

function writeNdjson(file, docs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = docs.map(d => JSON.stringify({ path: d.ref.path, data: encode(d.data()) })).join('\n');
  fs.writeFileSync(file, zlib.gzipSync(lines + (lines ? '\n' : '')));
}

function loadState() {
  const f = path.join(OUT, 'state.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { kitchens: {} };
}
function saveState(state) {
  const f = path.join(OUT, 'state.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(state, null, 2));
  fs.renameSync(f + '.tmp', f);
}

// Refreshes the project's quota-day usage at most once a minute, and adds our own reads
// since then so Monitoring's lag cannot make us overshoot.
// Cloud Monitoring needs billing when called as a service account on a Spark project. Without it
// the day's usage is unknown and only --max-reads limits the run, so keep that budget modest.
let monitoring = true;
async function projectReadsToday() {
  if (!monitoring) return reads;
  if (Date.now() - lastQuotaCheck.at > 60000) {
    try {
      lastQuotaCheck = { at: Date.now(), used: await usedToday(accessToken, projectId), readsAtCheck: reads };
    } catch (e) {
      monitoring = false;
      log(`WARN quota check unavailable (${e.message.slice(0, 80)}...), relying on --max-reads ${MAX_READS} only`);
      return reads;
    }
  }
  return lastQuotaCheck.used + (reads - lastQuotaCheck.readsAtCheck);
}

async function canSpend(n) {
  if (reads + n > MAX_READS) return false;
  return (await projectReadsToday()) + n <= CEILING;
}

async function get(query) {
  const snap = await query.get();
  reads += Math.max(1, snap.size);
  return snap.docs;
}

const cursorOf = d => ({ s: d.get('timestamp').seconds, n: d.get('timestamp').nanoseconds, id: d.id });
const ts = c => new Timestamp(c.s, c.n);

// Anonymised residents per kitchen, as seen in this run's snapshot.
const anonymised = {};

async function snapshotSmallCollections(kitchenRefs) {
  const dir = path.join(OUT, 'snapshots', runId.slice(0, 10));
  const kitchenDocs = kitchenRefs.length ? await db.getAll(...kitchenRefs) : [];
  reads += kitchenDocs.length;
  const existing = kitchenDocs.filter(d => d.exists);
  writeNdjson(path.join(dir, 'kitchens.ndjson.gz'), existing);
  for (const ref of kitchenRefs) {
    for (const c of ['users', 'products']) {
      const docs = await get(ref.collection(c));
      writeNdjson(path.join(dir, ref.id, `${c}.ndjson.gz`), docs);
      if (c === 'users') anonymised[ref.id] = docs.filter(d => d.get('anonymisedAt')).map(d => d.id);
    }
  }
  const all = fs.readdirSync(path.join(OUT, 'snapshots')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_SNAPSHOTS))) {
    fs.rmSync(path.join(OUT, 'snapshots', old), { recursive: true, force: true });
  }
  log(`snapshot ${dir}: ${existing.length} kitchens`);
}

// Kollegiet and Aktuelt's proposals: shared collections that grow every day, so a night reads only
// what can still have changed, and merges it into kollegiet/<collection>.ndjson.gz (every document
// by its path, the newest copy wins; never pruned). The first run reads everything.
//  - New since the last run (they never change): posts, kudos.
//  - Still going or ended in the last 3 days (answers, scores, results): events, battles with their
//    tallies, polls with their ballots.
//  - Small, one per kitchen or few: profiles, standings with achievements, seen, the slots, reports,
//    proposals (votes change any time), and each proposal's comments since the last run.
// Documents deleted later (taken back, hidden, a note taken down) stay in the files; hidden/ holds
// the hidden ones. A few dozen reads a night, however big Kollegiet grows.
const RECENT_MS = 3 * 864e5;

function mergeNdjson(file, docs) {
  const byPath = new Map();
  if (fs.existsSync(file)) {
    for (const l of zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean)) byPath.set(JSON.parse(l).path, l);
  }
  for (const d of docs) byPath.set(d.ref.path, JSON.stringify({ path: d.ref.path, data: encode(d.data()) }));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', zlib.gzipSync([...byPath.values()].join('\n') + (byPath.size ? '\n' : '')));
  fs.renameSync(file + '.tmp', file);
  return byPath.size;
}

async function snapshotKollegiet(state) {
  const dir = path.join(OUT, 'kollegiet');
  const startedAt = Date.now();
  // A margin for commits landing just as the last run read.
  const since = state.kollegietAt ? Timestamp.fromMillis(Date.parse(state.kollegietAt) - 3600e3) : null;
  const recent = Timestamp.fromMillis(Date.now() - RECENT_MS);
  const read = {};
  const save = (name, docs) => {
    read[name] = (read[name] || 0) + docs.length;
    return mergeNdjson(path.join(dir, `${name}.ndjson.gz`), docs);
  };
  const newer = (q, field = 'createdAt') => since ? q.where(field, '>', since) : q;
  for (const c of ['posts', 'kudos']) save(c, await get(newer(db.collection(c))));
  save('events', await get(since ? db.collection('events').where('endsAt', '>=', recent) : db.collection('events')));
  for (const [c, field, sub] of [['battles', 'to', 'tally'], ['polls', 'closesAt', 'ballots']]) {
    const docs = await get(since ? db.collection(c).where(field, '>=', recent) : db.collection(c));
    save(c, docs);
    for (const d of docs) save(sub, await get(d.ref.collection(sub)));
  }
  for (const c of ['profiles', 'seen', 'pollSlots', 'battleSlots', 'reports']) save(c, await get(db.collection(c)));
  const standings = await get(db.collection('standings'));
  save('standings', standings);
  save('achievements', await get(db.collectionGroup('achievements')));
  const proposals = await get(db.collection('proposals'));
  save('proposals', proposals);
  for (const p of proposals) save('comments', await get(newer(p.ref.collection('comments'))));
  state.kollegietAt = new Date(startedAt).toISOString();
  log(`kollegiet ${since ? 'since ' + since.toDate().toISOString() : 'in full'}: ${Object.entries(read).map(([k, n]) => `${k} ${n}`).join(', ')}`);
}

function savePurchases(kitchenId, docs, kind) {
  if (!docs.length) return;
  const file = path.join(OUT, 'purchases', kitchenId, `${runId}-${kind}-${docs[0].id}.ndjson.gz`);
  writeNdjson(file, docs);
}

async function incremental(ref, st) {
  if (!st.newest) return;
  const base = ref.collection('purchases').orderBy('timestamp').orderBy(FieldPath.documentId());
  while (await canSpend(CHUNK)) {
    const docs = await get(base.startAfter(ts(st.newest), st.newest.id).limit(CHUNK));
    savePurchases(ref.id, docs, 'new');
    if (docs.length) { st.newest = cursorOf(docs[docs.length - 1]); st.stored += docs.length; }
    if (docs.length < CHUNK) return true;
  }
  return false;
}

async function backfillChunk(ref, st) {
  let q = ref.collection('purchases').where('timestamp', '>=', cutoff)
    .orderBy('timestamp', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (st.oldest) q = q.startAfter(ts(st.oldest), st.oldest.id);
  const docs = await get(q.limit(CHUNK));
  savePurchases(ref.id, docs, 'old');
  if (docs.length) {
    if (!st.newest) st.newest = cursorOf(docs[0]);
    st.oldest = cursorOf(docs[docs.length - 1]);
    st.stored += docs.length;
  }
  if (docs.length < CHUNK) st.backfillDone = true;
}

// Purchases taken back: the app leaves a note in removed/ with each (PurchaseService.remove). Only
// the ids are kept, in removed/<kitchen>/, so the summaries (stats-summary.js) leave them out.
// Read after the kitchen's new purchases and always, whatever the budget: a purchase that run
// skipped was then already gone, so its note is read here, and the app subtracts only notes after
// st.removedThrough. A read per kitchen, and one per purchase taken back.
async function takenBack(ref, st) {
  let q = ref.collection('removed').orderBy('removedAt');
  if (st.removedThrough) q = q.startAfter(new Timestamp(st.removedThrough.s, st.removedThrough.n));
  const docs = await get(q);
  if (!docs.length) return;
  const file = path.join(OUT, 'removed', ref.id, `${runId}.ndjson.gz`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, zlib.gzipSync(docs.map(d => JSON.stringify({ id: d.id })).join('\n') + '\n'));
  const last = docs[docs.length - 1].get('removedAt');
  st.removedThrough = { s: last.seconds, n: last.nanoseconds };
}

// Compares the purchases inside the window (right after pruning, that is all of st.stored).
async function reconcile(ref, st) {
  const agg = await ref.collection('purchases').where('timestamp', '>=', cutoff).count().get();
  const live = agg.data().count;
  reads += Math.max(1, Math.ceil(live / 1000)); // count() costs a read per 1000 index entries
  st.lastCount = { at: new Date().toISOString(), live, stored: st.stored };
  if (live !== st.stored) log(`WARN ${ref.id}: live ${live} purchases in the last ${KEEP_DAYS} days, backed up ${st.stored} (deletes since backup)`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const state = loadState();
  // A night that failed (the day's quota already used up) is made up for as soon as the next
  // hourly run finds the last good one more than 25 hours old, instead of a day later.
  const missed = !state.lastRun || Date.now() - Date.parse(state.lastRun.at) > 25 * 36e5;
  if (args['before-reset'] && !missed) {
    const minutesLeft = (pacificMidnight().getTime() + 864e5 - Date.now()) / 60000;
    if (minutesLeft > +args['before-reset']) { log(`${Math.round(minutesLeft)} min until quota reset, skipping`); return; }
  }
  const startUsed = await projectReadsToday();
  log(`project ${projectId}, out ${OUT}, reads today ${startUsed}, ceiling ${CEILING}, run budget ${MAX_READS}`);
  if (startUsed >= CEILING) { log('ceiling already reached, nothing to do'); return; }

  const kitchenRefs = await db.collection('kitchens').listDocuments();
  reads += kitchenRefs.length;
  await snapshotSmallCollections(kitchenRefs);
  await snapshotKollegiet(state);
  saveState(state);

  for (const ref of kitchenRefs) state.kitchens[ref.id] ||= { stored: 0, backfillDone: false };
  saveState(state);

  for (const ref of kitchenRefs) {
    await incremental(ref, state.kitchens[ref.id]);
    await takenBack(ref, state.kitchens[ref.id]);
    saveState(state);
  }

  const backfillStart = reads;
  const canBackfill = async () => reads - backfillStart + CHUNK <= BACKFILL_READS && await canSpend(CHUNK);
  let pending = kitchenRefs.filter(r => !state.kitchens[r.id].backfillDone);
  while (pending.length && await canBackfill()) {
    for (const ref of pending) {
      if (!(await canBackfill())) break;
      await backfillChunk(ref, state.kitchens[ref.id]);
      saveState(state);
    }
    pending = pending.filter(r => !state.kitchens[r.id].backfillDone);
  }

  const pruned = prunePurchases(OUT, cutoff.toMillis());
  for (const [kid, n] of Object.entries(pruned.kept)) if (state.kitchens[kid]) state.kitchens[kid].stored = n;
  if (pruned.removed) log(`dropped ${pruned.removed} purchases older than ${KEEP_DAYS} days`);
  saveState(state);

  // Only when someone new was anonymised: this rereads every backed-up purchase file.
  const fresh = Object.fromEntries(Object.entries(anonymised).map(([kid, ids]) => {
    const done = new Set(state.kitchens[kid]?.scrubbed || []);
    return [kid, ids.filter(id => !done.has(id))];
  }).filter(([, ids]) => ids.length));
  if (Object.keys(fresh).length) {
    const changed = scrubAnonymised(OUT, fresh);
    for (const [kid, ids] of Object.entries(fresh)) state.kitchens[kid].scrubbed = [...(state.kitchens[kid].scrubbed || []), ...ids];
    log(`anonymised in backups: ${Object.values(fresh).flat().length} residents, ${changed.purchases} purchases, ${changed.residents} snapshot entries`);
  }

  const weekAgo = Date.now() - 7 * 864e5;
  for (const ref of kitchenRefs) {
    const st = state.kitchens[ref.id];
    if (st.backfillDone && !(st.lastCount && Date.parse(st.lastCount.at) > weekAgo)) await reconcile(ref, st);
  }
  state.lastRun = { at: new Date().toISOString(), reads };
  saveState(state);

  const total = Object.values(state.kitchens).reduce((s, k) => s + k.stored, 0);
  const done = Object.values(state.kitchens).filter(k => k.backfillDone).length;
  log(`done: ${reads} reads this run, ${total} purchases backed up, backfill complete for ${done}/${kitchenRefs.length} kitchens`);
})().catch(e => { console.error(e); process.exit(1); });
