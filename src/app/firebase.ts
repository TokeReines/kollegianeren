import {initializeApp} from 'firebase/app';
import {connectAuthEmulator, getAuth} from 'firebase/auth';
import {
  DocumentReference, Query, SnapshotOptions, connectFirestoreEmulator, initializeFirestore,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import {onSnapshot} from './read-meter';
import {Observable} from 'rxjs';
import {environment} from '../environments/environment';

export const app = initializeApp(environment.firebase);
export const auth = getAuth(app);
// Kitchen tablets lose Wi-Fi now and then: keep a local copy and queue writes until it is back.
export const db = initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})});

if (environment.emulators) {
  connectAuthEmulator(auth, 'http://localhost:9099', {disableWarnings: true});
  connectFirestoreEmulator(db, 'localhost', 8181);
}

// Purchases written with serverTimestamp() show an estimated time until the server confirms.
export const snapshotOptions: SnapshotOptions = {serverTimestamps: 'estimate'};

// Live query results as an Observable, each document's data plus its id.
export function watch<T>(q: Query): Observable<T[]> {
  return new Observable<T[]>(subscriber => onSnapshot(
    q,
    snap => subscriber.next(snap.docs.map(d => ({id: d.id, ...d.data(snapshotOptions)}) as T)),
    err => subscriber.error(err),
  ));
}

// One live document, or null while it does not exist.
export function watchDoc<T>(ref: DocumentReference): Observable<T | null> {
  return new Observable<T | null>(subscriber => onSnapshot(
    ref,
    snap => subscriber.next(snap.exists() ? {id: snap.id, ...snap.data(snapshotOptions)} as T : null),
    err => subscriber.error(err),
  ));
}
