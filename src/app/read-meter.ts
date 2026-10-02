import {
  CollectionReference, DocumentReference, DocumentSnapshot, Query, QuerySnapshot,
  getDoc as fsGetDoc, getDocs as fsGetDocs, onSnapshot as fsOnSnapshot,
} from 'firebase/firestore';

// Which screens read how much (the Spark plan has 50k reads a day): the app's reads go through
// these wrappers, which count the documents the server sent, by the page the user is on and the
// collection. Counts ride along in the usage counts (services/usage.service.ts), no extra writes.
//
// How it maps to what Firestore bills, roughly: a listener's first answer from the server is
// counted in full ("open"; an upper bound, since a listener resumed within 30 minutes is billed
// only for what changed), later answers by the documents that changed ("live"), and a one-off
// fetch by the documents it returned ("get"). Answers from the offline cache and the app's own
// pending writes cost nothing and are not counted.

export type ReadKind = 'open' | 'live' | 'get';
type Sink = (key: string, n: number) => void;

let page = 'start';
let sink: Sink | null = null;
const early: [string, number][] = [];

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
  let first = true;
  let delivered = false;
  rest[at] = (snap: QuerySnapshot | DocumentSnapshot) => {
    if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) {
      add(source, first ? 'open' : 'live', snapshotReads(snap, first));
      first = false;
    }
    const metadataOnly = isList && delivered && (snap as QuerySnapshot).docChanges().length === 0;
    if (wantsMetadata || !metadataOnly) {
      delivered = true;
      next(snap);
    }
  };
  if (!isList) {
    return (fsOnSnapshot as (...args: unknown[]) => () => void)(ref, ...rest);
  }
  const listen = options ? [{...options, includeMetadataChanges: true}, ...rest.slice(1)] : [{includeMetadataChanges: true}, ...rest];
  return (fsOnSnapshot as (...args: unknown[]) => () => void)(ref, ...listen);
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
