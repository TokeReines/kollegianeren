import {
  CollectionReference, DocumentReference, DocumentSnapshot, Query, QuerySnapshot,
  getDoc as fsGetDoc, getDocs as fsGetDocs, onSnapshot as fsOnSnapshot,
} from 'firebase/firestore';

// Which screens read how much (the Spark plan has 50k reads a day): the app's reads go through
// these wrappers, which count the documents the server sent, by the page the user is on and the
// collection. Counts ride along in the usage counts (services/usage.service.ts), no extra writes.
//
// How it maps to what Firestore bills: a listener opened fresh costs its whole result ("open"); the
// same query opened again within 30 minutes of the last time costs only what changed ("resume");
// changes while it is open cost one read each ("live"); a one-off fetch costs what it returned
// ("get"). And when the device was asleep or offline for more than 30 minutes, every open listener
// is billed in full again when it reconnects ("wake"), though nothing changes on screen. Answers
// from the offline cache and the app's own pending writes cost nothing and are not counted.
//
// "reconnect" is a list coming back after its connection dropped. Within the resume window the
// server resends only what changed, counted as "live"; after longer, the whole list again, counted
// here unless a wake already counted it. (Counted in full every time, a tablet on poor wifi looked
// like thousands of reads that Google's own count showed were never billed.)

export type ReadKind = 'open' | 'resume' | 'live' | 'get' | 'wake' | 'reconnect';
type Sink = (key: string, n: number) => void;

// Firestore's resume window: a listener away for longer is billed as a new query.
const RESUME_MS = 30 * 60e3;
const TICK_MS = 60e3;
const SEEN_KEY = 'kollegianeren.reads.seen';

let page = 'start';
let sink: Sink | null = null;
const early: [string, number][] = [];

// The listeners open now, with how many documents each holds, for what a wake costs.
interface Listener {
  source: string;
  key: string;
  size: number;
}
const active = new Set<Listener>();

// When each query (by key) was last live, kept across reloads, since Firestore keeps its resume
// tokens in the offline cache too.
let lastSeen: Record<string, number> = {};
try {
  lastSeen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
} catch {
  // Storage unavailable: every listener counts as opened fresh.
}

function saveSeen(now = Date.now()) {
  for (const l of active) {
    lastSeen[l.key] = now;
  }
  for (const [k, t] of Object.entries(lastSeen)) {
    if (now - t > RESUME_MS) {
      delete lastSeen[k];
    }
  }
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(lastSeen));
  } catch {
    // Not kept; only makes a reopen after a reload count as fresh.
  }
}

// What every open listener costs after a long sleep or a long time offline; also called when the
// app turns its own network back on after a long break (services/network.service.ts).
export function meterWake() {
  wake();
}

// When a wake was last counted, so a list reconnecting after it is not counted twice.
let lastWake = 0;

function wake() {
  lastWake = Date.now();
  const counted = new Set<string>();
  for (const l of active) {
    // Identical queries share one listen on the server.
    if (!counted.has(l.key)) {
      counted.add(l.key);
      add(l.source, 'wake', Math.max(1, l.size));
    }
  }
}

// A timer that stops while the device sleeps (timers do not run on a frozen page): a gap longer
// than the resume window means every listener reconnected after it. Offline counts the same way.
let lastTick = Date.now();
let offlineSince = 0;
if (typeof window !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    if (now - lastTick > RESUME_MS) {
      wake();
    }
    lastTick = now;
    saveSeen(now);
  }, TICK_MS);
  window.addEventListener('offline', () => offlineSince = Date.now());
  window.addEventListener('online', () => {
    if (offlineSince && Date.now() - offlineSince > RESUME_MS) {
      wake();
    }
    offlineSince = 0;
  });
}

// Which query a listener runs, so a reopen of the same one can be told from a new one.
export function queryKey(ref: unknown, source: string): string {
  if (ref instanceof DocumentReference) {
    return ref.path;
  }
  try {
    const q = (ref as {_query?: Record<string, unknown> & {path?: {canonicalString(): string}}})._query;
    return JSON.stringify([q?.path?.canonicalString(), q?.['collectionGroup'], q?.['filters'], q?.['explicitOrderBy'], q?.['limit']]);
  } catch {
    return source;
  }
}

// The page reads are put on, set by the usage service as the user navigates.
export function meterPage(p: string) {
  page = p;
}

// Where counts go; reads from before it is set (the first seconds of a start) are passed on then.
export function meterInto(s: Sink) {
  sink = s;
  for (const [key, n] of early.splice(0)) {
    s(key, n);
  }
}

function add(source: string, kind: ReadKind, n: number) {
  if (!n) {
    return;
  }
  const key = `${page}|${source}|${kind}`;
  if (sink) {
    sink(key, n);
  } else {
    early.push([key, n]);
  }
}

// The collection a reference or query reads from. Queries keep it internally; 'other' if not.
export function sourceOf(ref: unknown): string {
  if (ref instanceof DocumentReference) {
    return ref.parent.id;
  }
  if (ref instanceof CollectionReference) {
    return ref.id;
  }
  const q = (ref as {_query?: {collectionGroup?: string | null, path?: {lastSegment(): string}}} | null)?._query;
  return q?.collectionGroup || q?.path?.lastSegment() || 'other';
}

// What one snapshot from a listener cost: nothing from the cache or for our own pending writes;
// the whole result the first time the server answers, the changed documents after that.
interface SnapshotLike {
  metadata: {fromCache: boolean, hasPendingWrites: boolean};
  size?: number;
  docChanges?: () => unknown[];
}

// What a list costs on top of its changes when it comes back from offline: all of it, if it was
// away longer than the resume window and no wake has counted it since it dropped; else nothing.
export function reconnectReads(size: number, offlineAt: number, now: number, wokeAt: number): number {
  return now - offlineAt > RESUME_MS && wokeAt < offlineAt ? Math.max(1, size) : 0;
}

export function snapshotReads(snap: SnapshotLike, first: boolean): number {
  if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) {
    return 0;
  }
  if (snap.docChanges) {
    return first ? Math.max(1, snap.size ?? 0) : snap.docChanges().length;
  }
  return 1;
}

// onSnapshot, counted. Same arguments as Firestore's: the first function among them is `next`.
// A list listens with metadata changes, because when the server only confirms what the offline
// cache already showed, Firestore sends no other snapshot, and that confirmation can still be
// billed in full. Those metadata-only snapshots are not passed on unless the caller asked for
// them. A single document is listened to as asked (it costs one read at most).
export const onSnapshot = ((ref: unknown, ...rest: unknown[]) => {
  const at = rest.findIndex(a => typeof a === 'function');
  if (at < 0) {
    return (fsOnSnapshot as (...args: unknown[]) => () => void)(ref, ...rest);
  }
  const options = at > 0 && typeof rest[0] === 'object' ? rest[0] as {includeMetadataChanges?: boolean} : null;
  const wantsMetadata = !!options?.includeMetadataChanges;
  const isList = !(ref instanceof DocumentReference);
  const next = rest[at] as (snap: QuerySnapshot | DocumentSnapshot) => void;
  const source = sourceOf(ref);
  const listener: Listener = {source, key: queryKey(ref, source), size: 1};
  // The same query already open shares its listen and costs nothing more; live within the resume
  // window, the server sends, and bills, only what changed.
  const shared = [...active].some(l => l.key === listener.key);
  const resumed = shared || Date.now() - (lastSeen[listener.key] ?? 0) < RESUME_MS;
  let first = true;
  let delivered = false;
  let offlineAt = 0;
  rest[at] = (snap: QuerySnapshot | DocumentSnapshot) => {
    if (isList) {
      listener.size = (snap as QuerySnapshot).size;
      // After the first answer, a cached answer means the connection dropped; the next answer from
      // the server is the reconnect. Its changes are counted as live below.
      if (!first && snap.metadata.fromCache) {
        offlineAt ||= Date.now();
      } else if (offlineAt && !snap.metadata.fromCache) {
        const n = reconnectReads(listener.size, offlineAt, Date.now(), lastWake);
        if (n) {
          add(source, 'reconnect', n);
        }
        offlineAt = 0;
      }
    }
    if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) {
      const n = first && shared ? 0
        : first && resumed && isList ? (snap as QuerySnapshot).docChanges().length : snapshotReads(snap, first);
      add(source, first ? (resumed ? 'resume' : 'open') : 'live', n);
      first = false;
      lastSeen[listener.key] = Date.now();
    }
    const metadataOnly = isList && delivered && (snap as QuerySnapshot).docChanges().length === 0;
    if (wantsMetadata || !metadataOnly) {
      delivered = true;
      next(snap);
    }
  };
  const listen = !isList ? rest
    : options ? [{...options, includeMetadataChanges: true}, ...rest.slice(1)] : [{includeMetadataChanges: true}, ...rest];
  const stop = (fsOnSnapshot as (...args: unknown[]) => () => void)(ref, ...listen);
  active.add(listener);
  return () => {
    lastSeen[listener.key] = Date.now();
    active.delete(listener);
    stop();
  };
}) as typeof fsOnSnapshot;

// getDocs and getDoc, counted: a query that returns nothing still costs one read.
export async function getDocs<T>(q: Query<T>): Promise<QuerySnapshot<T>> {
  const snap = await fsGetDocs(q);
  if (!snap.metadata.fromCache) {
    add(sourceOf(q), 'get', Math.max(1, snap.size));
  }
  return snap;
}

export async function getDoc<T>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  const snap = await fsGetDoc(ref);
  if (!snap.metadata.fromCache) {
    add(sourceOf(ref), 'get', 1);
  }
  return snap;
}
