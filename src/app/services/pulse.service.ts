import {Injectable, inject} from '@angular/core';
import {DocumentData, Query, Timestamp, WriteBatch, doc, getDocsFromCache, serverTimestamp} from 'firebase/firestore';
import {Observable, catchError, concat, distinctUntilChanged, filter, from, map, of, shareReplay, switchMap} from 'rxjs';
import {db, snapshotOptions, watchDoc} from '../firebase';
import {getDocs} from '../read-meter';
import {millis} from '../time';
import {AuthService, Membership} from './auth.service';
import {whileSignedIn} from './kitchen-data';

// What the bell, the badges, the buy page and the kitchen names need from Kollegiet and Aktuelt.
export type PulseKind = 'kitchens' | 'events' | 'kudos' | 'battles' | 'posts' | 'news' | 'proposals';

const PULSE = doc(db, 'pulse', 'kollegiet');
const FETCHED_KEY = 'kollegianeren.pulse.fetched';

// Adds "this kind changed now" to a write: every write that adds, changes or removes something of
// a kind moves its time in the same batch (the rules allow only the server's time).
export function bump(batch: WriteBatch, ...kinds: PulseKind[]): WriteBatch {
  return batch.set(PULSE, Object.fromEntries(kinds.map(k => [k, serverTimestamp()])), {merge: true});
}

// How the app hears that something is new without keeping every list open (reads on the free
// plan): pulse/kollegiet holds when each kind last changed. The shell listens to that one document
// and fetches a list again only when its time has moved since this device last fetched it, which
// it remembers across reloads; otherwise the list comes from the offline cache, for free. A tablet
// waking up then costs one read, not a dozen lists. Pages that show the lists in full (Kollegiet,
// Aktuelt) still listen live while they are open.
@Injectable({providedIn: 'root'})
export class PulseService {
  private readonly auth = inject(AuthService);
  private readonly pulse$ = whileSignedIn(this.auth.viewer$, () => watchDoc<Record<string, Timestamp>>(PULSE), null)
    .pipe(shareReplay({bufferSize: 1, refCount: false}));

  // The list `build` makes, as of the last change of `kind`: from the cache straight away, then
  // from the server whenever `kind` has changed since this device fetched it.
  list<T>(kind: PulseKind, build: (viewer: Membership) => Query<DocumentData>): Observable<T[]> {
    return this.auth.viewer$.pipe(
      switchMap(viewer => {
        if (!viewer) {
          return of([] as T[]);
        }
        const key = `${viewer.uid}|${kind}`;
        const cached = from(getDocsFromCache(build(viewer)).then(s => docsOf<T>(s.docs), () => null))
          .pipe(filter((l): l is T[] => l !== null));
        const fresh = this.pulse$.pipe(
          filter(p => p !== undefined),
          map(p => millis(p?.[kind])),
          distinctUntilChanged(),
          filter(at => at === 0 || at !== fetched()[key]),
          switchMap(at => from(getDocs(build(viewer))).pipe(
            map(s => {
              remember(key, at);
              return docsOf<T>(s.docs);
            }),
            catchError(() => of(null)),
          )),
          filter((l): l is T[] => l !== null),
        );
        return concat(cached, fresh);
      }),
      shareReplay({bufferSize: 1, refCount: true}),
    );
  }
}

function docsOf<T>(docs: {id: string, data(o?: unknown): DocumentData}[]): T[] {
  return docs.map(d => ({id: d.id, ...d.data(snapshotOptions)}) as T);
}

// When each kind was last fetched on this device (by login and kind), kept across reloads.
function fetched(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FETCHED_KEY) || '{}');
  } catch {
    return {};
  }
}

function remember(key: string, at: number) {
  try {
    localStorage.setItem(FETCHED_KEY, JSON.stringify({...fetched(), [key]: at}));
  } catch {
    // Not kept: the next start fetches again, as before.
  }
}
