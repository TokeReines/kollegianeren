// One listener on dev's public kitchens collection, with the app's Firebase version and offline
// cache, logging every snapshot so run.js can compare it with Google's per-minute read count.
// ?n=<limit> sets how many documents the list holds, so its cost identifies it.
import {initializeApp} from 'firebase/app';
import {
  collection, documentId, initializeFirestore, limit, onSnapshot, orderBy, persistentLocalCache, persistentMultipleTabManager, query,
} from 'firebase/firestore';

const n = +new URLSearchParams(location.search).get('n');
const app = initializeApp({
  apiKey: 'AIzaSyBQYwdOvSjikzel3fLDmO7wY75byglR5T4',
  authDomain: 'kollegianeren.firebaseapp.com',
  projectId: 'kollegianeren',
});
const db = initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})});
const log = o => console.log('EXP ' + JSON.stringify({t: Date.now(), n, ...o}));

onSnapshot(query(collection(db, 'kitchens'), orderBy(documentId()), limit(n)), {includeMetadataChanges: true},
  snap => log({fromCache: snap.metadata.fromCache, size: snap.size, changes: snap.docChanges().length}),
  err => log({error: err.code}));
log({started: true});
