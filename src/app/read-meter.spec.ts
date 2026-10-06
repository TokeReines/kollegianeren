import {initializeApp} from 'firebase/app';
import {collection, collectionGroup, doc, getFirestore, limit, orderBy, query, where} from 'firebase/firestore';
import {queryKey, reconnectReads, snapshotReads, sourceOf} from './read-meter';

const meta = (fromCache: boolean, hasPendingWrites = false) => ({fromCache, hasPendingWrites});
const list = (size: number, changes: number, m = meta(false)) => ({metadata: m, size, docChanges: () => new Array(changes).fill(0)});

describe('read meter', () => {
  it('counts a dropped connection in full only after the resume window, once', () => {
    const min = 60e3;
    // Back within 30 minutes: only the changes, counted as live.
    expect(reconnectReads(55, 0, 4 * min, 0)).toBe(0);
    expect(reconnectReads(55, 0, 30 * min, 0)).toBe(0);
    // Away longer: the whole list again.
    expect(reconnectReads(55, 0, 31 * min, -1)).toBe(55);
    expect(reconnectReads(0, 0, 31 * min, -1)).toBe(1);
    // Unless a wake after it dropped already counted it.
    expect(reconnectReads(55, 0, 31 * min, 20 * min)).toBe(0);
  });

  it('counts what the server sent, not the cache or our own writes', () => {
    expect(snapshotReads(list(40, 40), true)).toBe(40);
    expect(snapshotReads(list(40, 2), false)).toBe(2);
    expect(snapshotReads(list(0, 0), true)).toBe(1);
    expect(snapshotReads(list(40, 40, meta(true)), true)).toBe(0);
    expect(snapshotReads(list(41, 1, meta(false, true)), false)).toBe(0);
    expect(snapshotReads({metadata: meta(false)}, true)).toBe(1);
    expect(snapshotReads({metadata: meta(true)}, true)).toBe(0);
  });

  it('names the collection a reference or query reads', () => {
    const db = getFirestore(initializeApp({projectId: 'demo-meter'}, 'meter-test'));
    expect(sourceOf(collection(db, 'kitchens', 'k1', 'purchases'))).toBe('purchases');
    expect(sourceOf(doc(db, 'kitchens', 'k1', 'products', 'p1'))).toBe('products');
    expect(sourceOf(query(collection(db, 'posts'), orderBy('createdAt'), limit(5)))).toBe('posts');
    expect(sourceOf(query(collection(db, 'kitchens', 'k1', 'purchases'), where('timestamp', '>=', 1)))).toBe('purchases');
    expect(sourceOf(collectionGroup(db, 'achievements'))).toBe('achievements');
  });

  it('tells the same query from a different one, for reopens', () => {
    const db = getFirestore(initializeApp({projectId: 'demo-meter-keys'}, 'meter-keys'));
    const purchases = collection(db, 'kitchens', 'k1', 'purchases');
    const since = (ms: number) => query(purchases, where('timestamp', '>=', new Date(ms)), orderBy('timestamp'));
    expect(queryKey(since(1000), 'purchases')).toBe(queryKey(since(1000), 'purchases'));
    expect(queryKey(since(1000), 'purchases')).not.toBe(queryKey(since(2000), 'purchases'));
    expect(queryKey(query(purchases, limit(30)), 'purchases')).not.toBe(queryKey(query(purchases, limit(31)), 'purchases'));
    expect(queryKey(collection(db, 'kitchens', 'k1', 'products'), 'products')).not.toBe(queryKey(collection(db, 'kitchens', 'k2', 'products'), 'products'));
    expect(queryKey(doc(db, 'seen', 'k1'), 'seen')).toBe('seen/k1');
  });
});
