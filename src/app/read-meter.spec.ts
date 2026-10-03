import {initializeApp} from 'firebase/app';
import {collection, collectionGroup, doc, getFirestore, limit, orderBy, query, where} from 'firebase/firestore';
import {snapshotReads, sourceOf} from './read-meter';

const meta = (fromCache: boolean, hasPendingWrites = false) => ({fromCache, hasPendingWrites});
const list = (size: number, changes: number, m = meta(false)) => ({metadata: m, size, docChanges: () => new Array(changes).fill(0)});

describe('read meter', () => {
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
});
