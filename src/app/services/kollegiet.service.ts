import {Injectable, computed, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {
  Timestamp, addDoc, collection, deleteDoc, deleteField, doc, getDoc, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  writeBatch,
} from 'firebase/firestore';
import {Observable, catchError, distinctUntilChanged, map, of, shareReplay, switchMap} from 'rxjs';
import {
  Badge, KEvent, Kudos, Poll, Post, Profile, Rsvp, Standing, highfiveId, pollId,
} from '../interfaces/kollegiet';
import {Kitchen} from '../interfaces/kitchen';
import {dayKey} from '../interfaces/meal';
import {db, watch, watchDoc} from '../firebase';
import {millis} from '../time';
import {AuthService} from './auth.service';
import {whileSignedIn} from './kitchen-data';

const DAY = 864e5;
// Posts from Kollegiet itself (results, achievements), written by ops/league.js.
const SYSTEM = 'kollegiet';

export type EventFields = Pick<KEvent, 'kind' | 'title' | 'text' | 'place' | 'startsAt' | 'endsAt' | 'invited'>;
export type HideableCollection = 'posts' | 'events' | 'kudos' | 'battles' | 'polls';

export interface Report {
  id: string;
  kitchenId: string;
  target: string;
  text: string;
  createdAt: Timestamp;
  // What it points at, if it is still there.
  item?: (Record<string, unknown> & {id: string}) | null;
}

// A kitchen as other kitchens see it: name, emoji and colour.
export interface KitchenCard {
  id: string;
  name: string;
  emoji: string;
  colour: string;
  bio: string;
}

// Kollegiet's board, events, kudos, polls and profiles (docs/kollegiet.md). Listeners are capped
// and shared: the shell keeps events, kudos and battles open for the notifications, the page reuses them.
@Injectable({providedIn: 'root'})
export class KollegietService {
  private readonly auth = inject(AuthService);

  private shared<T>(build: () => Observable<T[]>): Observable<T[]> {
    return whileSignedIn(this.auth.membership$, build, [] as T[]).pipe(shareReplay({bufferSize: 1, refCount: true}));
  }

  readonly kitchens$ = this.shared(() => watch<Kitchen>(collection(db, 'kitchens')));
  readonly profiles$ = this.shared(() => watch<Profile>(collection(db, 'profiles')));
  readonly standings$ = this.shared(() => watch<Standing>(collection(db, 'standings')));
  readonly posts$ = this.shared(() => watch<Post>(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(60))));
  // Events that have not been over for a day.
  readonly events$ = this.shared(() => watch<KEvent>(query(collection(db, 'events'),
    where('endsAt', '>=', Timestamp.fromMillis(Date.now() - DAY)), orderBy('endsAt'), limit(40))));
  readonly kudos$ = this.shared(() => watch<Kudos>(query(collection(db, 'kudos'), orderBy('createdAt', 'desc'), limit(60))));
  readonly polls$ = this.shared(() => watch<Poll>(query(collection(db, 'polls'),
    where('closesAt', '>=', Timestamp.fromMillis(Date.now() - 14 * DAY)), orderBy('closesAt'), limit(20))));
  // When the kitchen last opened Kollegiet and Aktuelt: one document, one listener.
  private readonly seenDoc$ = whileSignedIn(this.auth.membership$,
    kid => watchDoc<{kollegietAt?: Timestamp, aktueltAt?: Timestamp}>(doc(db, 'seen', kid)), null,
  ).pipe(shareReplay({bufferSize: 1, refCount: true}));
  readonly seen$ = this.seenDoc$.pipe(map(s => millis(s?.kollegietAt)), distinctUntilChanged(),
    shareReplay({bufferSize: 1, refCount: true}));
  readonly aktueltSeen$ = this.seenDoc$.pipe(map(s => millis(s?.aktueltAt)), distinctUntilChanged(),
    shareReplay({bufferSize: 1, refCount: true}));

  // Posts since the kitchen last opened Kollegiet, for the menu badge: only the new ones are read.
  readonly newPosts$ = this.seen$.pipe(
    switchMap(seen => watch<Post>(query(collection(db, 'posts'), where('createdAt', '>', Timestamp.fromMillis(seen)), orderBy('createdAt'), limit(20)))
      .pipe(catchError(() => of([] as Post[])))),
    shareReplay({bufferSize: 1, refCount: true}),
  );

  private readonly kitchenList = toSignal(this.kitchens$, {initialValue: []});
  private readonly profileList = toSignal(this.profiles$, {initialValue: []});

  // Every kitchen with its profile, by name. A kitchen document without a name (an empty one
  // left behind) is not a kitchen anyone plays with.
  readonly cards = computed<KitchenCard[]>(() => {
    const profiles = new Map(this.profileList().map(p => [p.id, p]));
    return this.kitchenList().filter(k => typeof k.name === 'string' && k.name !== '').map(k => {
      const p = profiles.get(k.id);
      return {id: k.id, name: k.name, emoji: p?.emoji ?? '🏠', colour: p?.colour ?? 'grey', bio: p?.bio ?? ''};
    }).sort((a, b) => a.name.localeCompare(b.name, 'da', {numeric: true}));
  });
  readonly byId = computed(() => new Map(this.cards().map(c => [c.id, c])));

  card(id: string): KitchenCard {
    if (id === SYSTEM) {
      return {id, name: 'Kollegiet', emoji: '🏆', colour: 'amber', bio: ''};
    }
    return this.byId().get(id) ?? {id, name: '?', emoji: '🏠', colour: 'grey', bio: ''};
  }

  get kitchenId(): string {
    return this.auth.currentKitchenId;
  }

  async markSeen() {
    return setDoc(doc(db, 'seen', this.kitchenId), {kollegietAt: serverTimestamp()}, {merge: true});
  }

  async markAktueltSeen() {
    return setDoc(doc(db, 'seen', this.kitchenId), {aktueltAt: serverTimestamp()}, {merge: true});
  }

  saveProfile(fields: Pick<Profile, 'emoji' | 'colour' | 'bio'>) {
    return setDoc(doc(db, 'profiles', this.kitchenId), {...fields, updatedAt: serverTimestamp()});
  }

  // A post, a reply (parentId) or a post for one kitchen (to). Moves the rate limit in the same batch.
  post(text: string, opts: {to?: string | null, parentId?: string | null} = {}) {
    const kid = this.kitchenId;
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'posts')), {kitchenId: kid, text, to: opts.to ?? null, parentId: opts.parentId ?? null, createdAt: serverTimestamp()});
    batch.set(doc(db, 'seen', kid), {lastPostAt: serverTimestamp()}, {merge: true});
    return batch.commit();
  }

  // Taking back your own (for five minutes) needs no trace.
  takeBack(collectionName: HideableCollection, id: string) {
    return deleteDoc(doc(db, collectionName, id));
  }

  // Hiding (a manager of the author kitchen, or the maker): moved to hidden/ for the maker.
  hide(collectionName: HideableCollection, item: {id: string}, authorKitchenId: string) {
    const batch = writeBatch(db);
    const {id, ...data} = item as Record<string, unknown> & {id: string};
    batch.set(doc(db, 'hidden', `${collectionName}_${id}`), {collection: collectionName, kitchenId: authorKitchenId, data, hiddenAt: serverTimestamp()});
    batch.delete(doc(db, collectionName, id));
    return batch.commit();
  }

  report(target: string, text: string) {
    return addDoc(collection(db, 'reports'), {kitchenId: this.kitchenId, target, text, createdAt: serverTimestamp()});
  }

  // The maker's side: reports from kitchens and from ops/league.js, with what they point at.
  reports(): Observable<Report[]> {
    return watch<Report>(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(50))).pipe(
      switchMap(list => list.length ? Promise.all(list.map(async r => {
        const [name, id] = r.target.split('/');
        const target = name && id ? await getDoc(doc(db, name, id)).catch(() => null) : null;
        return {...r, item: target?.exists() ? {id: target.id, ...target.data()} as Record<string, unknown> & {id: string} : null};
      })) : Promise.resolve([])),
    );
  }

  // Done with a report; hiding what it points at moves that to hidden/ first.
  async resolve(report: Report, hide: boolean) {
    const [name] = report.target.split('/');
    if (hide && report.item) {
      const author = String(report.item['kitchenId'] ?? report.item['from'] ?? '');
      await this.hide(name as HideableCollection, report.item, author);
    }
    await deleteDoc(doc(db, 'reports', report.id));
  }

  createEvent(fields: EventFields) {
    return addDoc(collection(db, 'events'), {...fields, kitchenId: this.kitchenId, rsvp: {}, createdAt: serverTimestamp()});
  }

  updateEvent(e: KEvent, fields: EventFields) {
    return updateDoc(doc(db, 'events', e.id), {...fields});
  }

  rsvp(e: KEvent, answer: Rsvp | null) {
    return updateDoc(doc(db, 'events', e.id), {[`rsvp.${this.kitchenId}`]: answer ?? deleteField()});
  }

  highfive(to: string) {
    const from = this.kitchenId;
    return setDoc(doc(db, 'kudos', highfiveId(from, to, dayKey(new Date()))),
      {from, to, kind: 'highfive', badge: null, reason: '', createdAt: serverTimestamp()});
  }

  giveBadge(to: string, badge: Badge, reason: string) {
    return addDoc(collection(db, 'kudos'), {from: this.kitchenId, to, kind: 'badge', badge, reason, createdAt: serverTimestamp()});
  }

  createPoll(title: string, opensAt: Date, closesAt: Date) {
    const kid = this.kitchenId;
    return setDoc(doc(db, 'polls', pollId(kid, opensAt)), {
      kitchenId: kid, title, opensAt: Timestamp.fromDate(opensAt), closesAt: Timestamp.fromDate(closesAt), createdAt: serverTimestamp(),
    });
  }

  // The kitchen's own vote: the only one it may read.
  myBallot(poll: Poll): Observable<string | null> {
    return watchDoc<{choice: string}>(doc(db, 'polls', poll.id, 'ballots', this.kitchenId)).pipe(map(b => b?.choice ?? null));
  }

  vote(poll: Poll, choice: string | null) {
    const ref = doc(db, 'polls', poll.id, 'ballots', this.kitchenId);
    return choice ? setDoc(ref, {choice, at: serverTimestamp()}) : deleteDoc(ref);
  }
}
