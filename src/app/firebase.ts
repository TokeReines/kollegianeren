import {initializeApp} from 'firebase/app';
import {connectAuthEmulator, getAuth} from 'firebase/auth';
import {
  CollectionReference, DocumentData, Query, SnapshotOptions, connectFirestoreEmulator, getFirestore, onSnapshot,
} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {environment} from '../environments/environment';

export const app = initializeApp(environment.firebase);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (environment.emulators) {
  connectAuthEmulator(auth, 'http://localhost:9099', {disableWarnings: true});
  connectFirestoreEmulator(db, 'localhost', 8181);
}

// Purchases written with serverTimestamp() show an estimated time until the server confirms.
const snapshotOptions: SnapshotOptions = {serverTimestamps: 'estimate'};

// Live query results as an Observable, each document's data plus its id.
export function watch<T>(q: Query<DocumentData> | CollectionReference<DocumentData>): Observable<T[]> {
  return new Observable<T[]>(subscriber => onSnapshot(
    q,
    snap => subscriber.next(snap.docs.map(d => ({id: d.id, ...d.data(snapshotOptions)}) as T)),
    err => subscriber.error(err),
  ));
}
