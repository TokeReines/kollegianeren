#!/usr/bin/env node
// Quota-aware Firestore backup for the free Spark plan (50k reads/day, hard cap).
//
//   node backup.js --project prod [--out DIR] [--max-reads 20000] [--ceiling 35000] [--chunk 500]
//                  [--before-reset MINUTES]  (only run if the quota day ends within MINUTES)
//
// Every run:
//   1. Snapshots the small collections (kitchen docs, users, products) into snapshots/<date>/.
//   2. Pulls new purchases per kitchen since the newest one already backed up.
//   3. Spends the remaining read budget backfilling older purchases, newest first,
//      round-robin across kitchens, resuming from a cursor stored in state.json.
// It stops before this run's reads pass --max-reads, or before the project's reads for the
// quota day pass --ceiling, so the kitchens always keep headroom.
//
// Limitations: purchases edited in place (same timestamp) or hard-deleted after being backed
// up are not re-read. Once backfill is done, a cheap count() per kitchen flags mismatches.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { FieldPath, Timestamp } = require('firebase-admin/firestore');
const { init, parseArgs } = require('./lib/firebase');
const { encode } = require('./lib/codec');
const { usedToday, pacificMidnight } = require('./lib/quota');

const args = parseArgs();
const { projectId, db, accessToken } = init(args.project);
const OUT = path.resolve(args.out || path.join(os.homedir(), 'kollegianeren-backups', projectId));
const MAX_READS = +(args['max-reads'] || 20000);
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
async function projectReadsToday() {
  if (Date.now() - lastQuotaCheck.at > 60000) {
    lastQuotaCheck = { at: Date.now(), used: await usedToday(accessToken, projectId), readsAtCheck: reads };
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

async function snapshotSmallCollections(kitchenRefs) {
  const dir = path.join(OUT, 'snapshots', runId.slice(0, 10));
  const kitchenDocs = kitchenRefs.length ? await db.getAll(...kitchenRefs) : [];
  reads += kitchenDocs.length;
  const existing = kitchenDocs.filter(d => d.exists);
  writeNdjson(path.join(dir, 'kitchens.ndjson.gz'), existing);
  for (const ref of kitchenRefs) {
    for (const c of ['users', 'products']) {
      writeNdjson(path.join(dir, ref.id, `${c}.ndjson.gz`), await get(ref.collection(c)));
    }
  }
  const all = fs.readdirSync(path.join(OUT, 'snapshots')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_SNAPSHOTS))) {
    fs.rmSync(path.join(OUT, 'snapshots', old), { recursive: true, force: true });
  }
  log(`snapshot ${dir}: ${existing.length} kitchens`);
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
  let q = ref.collection('purchases').orderBy('timestamp', 'desc').orderBy(FieldPath.documentId(), 'desc');
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

async function reconcile(ref, st) {
  const agg = await ref.collection('purchases').count().get();
  reads += 1;
  const live = agg.data().count;
  st.lastCount = { at: new Date().toISOString(), live, stored: st.stored };
  if (live !== st.stored) log(`WARN ${ref.id}: live ${live} purchases, backed up ${st.stored} (deletes or docs without timestamp)`);
}

(async () => {
  if (args['before-reset']) {
    const minutesLeft = (pacificMidnight().getTime() + 864e5 - Date.now()) / 60000;
    if (minutesLeft > +args['before-reset']) { log(`${Math.round(minutesLeft)} min until quota reset, skipping`); return; }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const state = loadState();
  const startUsed = await projectReadsToday();
  log(`project ${projectId}, out ${OUT}, reads today ${startUsed}, ceiling ${CEILING}, run budget ${MAX_READS}`);
  if (startUsed >= CEILING) { log('ceiling already reached, nothing to do'); return; }

  const kitchenRefs = await db.collection('kitchens').listDocuments();
  reads += kitchenRefs.length;
  await snapshotSmallCollections(kitchenRefs);

  for (const ref of kitchenRefs) state.kitchens[ref.id] ||= { stored: 0, backfillDone: false };
  saveState(state);

  for (const ref of kitchenRefs) {
    await incremental(ref, state.kitchens[ref.id]);
    saveState(state);
  }

  let pending = kitchenRefs.filter(r => !state.kitchens[r.id].backfillDone);
  while (pending.length && await canSpend(CHUNK)) {
    for (const ref of pending) {
      if (!(await canSpend(CHUNK))) break;
      await backfillChunk(ref, state.kitchens[ref.id]);
      saveState(state);
    }
    pending = pending.filter(r => !state.kitchens[r.id].backfillDone);
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
