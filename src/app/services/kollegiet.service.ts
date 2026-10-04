import {Injectable, computed, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {
  Timestamp, WriteBatch, collection, collectionGroup, deleteDoc, deleteField, doc, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import {getDoc, onSnapshot} from '../read-meter';
import {Observable, ReplaySubject, catchError, combineLatest, distinctUntilChanged, finalize, firstValueFrom, map, of, share, shareReplay, switchMap, timer} from 'rxjs';
import {
  Achievement, Badge, KEvent, Kudos, LIVE_HOURS_MAX, NOTES_MAX, POLL_SLOTS, Poll, liveCallId, Post, Profile, Rsvp, Standing, highfiveId,
} from '../interfaces/kollegiet';
import {Kitchen} from '../interfaces/kitchen';
import {dayKey} from '../interfaces/meal';
import {db, watch, watchDoc} from '../firebase';
import {millis} from '../time';
import {AuthService} from './auth.service';
import {whileSignedIn} from './kitchen-data';
import {UsageService} from './usage.service';
import {PulseKind, PulseService, bump} from './pulse.service';

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
  // Whether the kitchen has made a profile on Kollegiet.
  profiled: boolean;
  lends: string[];
}

// Kollegiet's board, events, kudos, polls and profiles (docs/kollegiet.md). The live lists are for
// the Kollegiet page while it is open; the rest of the app (the bell, the badges, the buy page and
// kitchen names) uses lists fetched when pulse/kollegiet says they changed (services/pulse.service.ts).
@Injectable({providedIn: 'root'})
export class KollegietService {
  private readonly usage = inject(UsageService);
  private readonly auth = inject(AuthService);
  private readonly pulse = inject(PulseService);

  private shared<T>(build: () => Observable<T[]>): Observable<T[]> {
    return whileSignedIn(this.auth.viewer$, build, [] as T[]).pipe(shareReplay({bufferSize: 1, refCount: true}));
  }

  // Names, emojis and colours for every kitchen card in the app: fetched when a kitchen is added,
  // renamed or changes its profile.
  readonly kitchens$ = this.pulse.list<Kitchen>('kitchens', () => collection(db, 'kitchens'));
  readonly profiles$ = this.pulse.list<Profile>('kitchens', () => collection(db, 'profiles'));
  readonly standings$ = this.shared(() => watch<Standing>(collection(db, 'standings')));
  // Every kitchen's achievements, by kitchen: one listener on them all (a read per achievement),
  // for the cards and the profile on Køkkener.
  readonly achievements$: Observable<Map<string, Achievement[]>> = whileSignedIn(this.auth.viewer$,
    () => new Observable<Map<string, Achievement[]>>(sub => onSnapshot(collectionGroup(db, 'achievements'), snap => {
      const by = new Map<string, Achievement[]>();
      for (const d of snap.docs) {
        const kid = d.ref.parent.parent?.id;
        if (kid) {
          by.set(kid, [...(by.get(kid) ?? []), {id: d.id, ...d.data()} as Achievement]);
        }
      }
      sub.next(by);
    }, err => sub.error(err))), new Map<string, Achievement[]>()).pipe(shareReplay({bufferSize: 1, refCount: true}));
  // The kitchen's own counts, for the badges it wears in the top bar: one document.
  readonly myStanding$ = whileSignedIn(this.auth.kitchen$,
    kid => watchDoc<Standing>(doc(db, 'standings', kid)), null).pipe(shareReplay({bufferSize: 1, refCount: true}));
  // The board's notes and their replies. The notes on their own (a kitchen keeps at most
  // NOTES_PER_KITCHEN up, so the limit holds every kitchen's), so a long thread cannot push other
  // kitchens' notes off the board; then their replies, a listener per 30 notes (Firestore's "in"
  // limit), oldest notes first: a new note only changes the last listener, the others stay open.
  readonly posts$ = this.shared(() => watch<Post>(query(collection(db, 'posts'), where('parentId', '==', null),
    orderBy('createdAt', 'desc'), limit(NOTES_MAX))).pipe(
    switchMap(notes => {
      const ids = notes.map(n => n.id).reverse();
      const chunks = Array.from({length: Math.ceil(ids.length / 30)}, (_, i) => ids.slice(i * 30, i * 30 + 30));
      return chunks.length ? combineLatest(chunks.map(c => this.repliesTo(c))).pipe(map(r => [...notes, ...r.flat()])) : of(notes);
    })));
  private readonly replyLists = new Map<string, Observable<Post[]>>();
  // One listener per set of notes, kept while the board shows them.
  private repliesTo(ids: string[]): Observable<Post[]> {
    const key = ids.join();
    let list = this.replyLists.get(key);
    if (!list) {
      // Kept a moment after the last subscriber leaves, so a board that swaps its lists keeps this one.
      list = watch<Post>(query(collection(db, 'posts'), where('parentId', 'in', ids))).pipe(
        finalize(() => this.replyLists.delete(key)),
        share({connector: () => new ReplaySubject<Post[]>(1), resetOnRefCountZero: () => timer(5000)}));
      this.replyLists.set(key, list);
    }
    return list;
  }
  // Events that have not been over for a day. Latest ending first: the lower bound is fixed when the
  // listener opens, so on a tablet open for weeks old ones would otherwise fill the limit.
  readonly events$ = this.shared(() => watch<KEvent>(query(collection(db, 'events'),
    where('endsAt', '>=', Timestamp.fromMillis(Date.now() - DAY)), orderBy('endsAt', 'desc'), limit(40))));
  readonly kudos$ = this.shared(() => watch<Kudos>(query(collection(db, 'kudos'), orderBy('createdAt', 'desc'), limit(60))));
  // For the bell, the badges and the buy page: events, and the kitchen's own kudos of the last two
  // weeks (newer than the nightly standing, for the badges it wears), fetched when they change.
  readonly noticeEvents$ = this.pulse.list<KEvent>('events', () => query(collection(db, 'events'),
    where('endsAt', '>=', Timestamp.fromMillis(Date.now() - DAY)), orderBy('endsAt', 'desc'), limit(40)));
  readonly myKudos$ = this.pulse.list<Kudos>('kudos', v => query(collection(db, 'kudos'), where('to', '==', v.kitchenId),
    where('createdAt', '>=', Timestamp.fromMillis(Date.now() - 14 * DAY)), orderBy('createdAt', 'desc'), limit(60)));
  readonly polls$ = this.shared(() => watch<Poll>(query(collection(db, 'polls'),
    where('closesAt', '>=', Timestamp.fromMillis(Date.now() - 14 * DAY)), orderBy('closesAt', 'desc'), limit(20))));
  // When the kitchen last opened Kollegiet and Aktuelt: one document, one listener.
  private readonly seenDoc$ = whileSignedIn(this.auth.kitchen$,
    kid => watchDoc<{kollegietAt?: Timestamp, aktueltAt?: Timestamp}>(doc(db, 'seen', kid)), null,
  ).pipe(shareReplay({bufferSize: 1, refCount: true}));
  readonly seen$ = this.seenDoc$.pipe(map(s => millis(s?.kollegietAt)), distinctUntilChanged(),
    shareReplay({bufferSize: 1, refCount: true}));
  readonly aktueltSeen$ = this.seenDoc$.pipe(map(s => millis(s?.aktueltAt)), distinctUntilChanged(),
    shareReplay({bufferSize: 1, refCount: true}));

  // Posts since the kitchen last opened Kollegiet, for the menu badge: fetched when a post is added.
  readonly newPosts$ = this.seen$.pipe(
    switchMap(seen => this.pulse.list<Post>('posts', () => query(collection(db, 'posts'), where('createdAt', '>', Timestamp.fromMillis(seen)),
      orderBy('createdAt'), limit(20))).pipe(catchError(() => of([] as Post[])))),
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
      return {id: k.id, name: k.name, emoji: p?.emoji ?? '🏠', colour: p?.colour ?? 'grey', bio: p?.bio ?? '', profiled: !!p, lends: p?.lends ?? []};
    }).sort((a, b) => a.name.localeCompare(b.name, 'da', {numeric: true}));
  });
  readonly byId = computed(() => new Map(this.cards().map(c => [c.id, c])));

  card(id: string): KitchenCard {
    if (id === SYSTEM) {
      return {id, name: 'Kollegiet', emoji: '🏆', colour: 'amber', bio: '', profiled: true, lends: []};
    }
    return this.byId().get(id) ?? {id, name: '?', emoji: '🏠', colour: 'grey', bio: '', profiled: false, lends: []};
  }

  get kitchenId(): string {
    return this.auth.currentKitchenId;
  }

  // When the kitchen had last looked, before this visit: what is new on the board. Opening
  // Kollegiet marks it all seen at once, so the board needs the time from before, read first.
  readonly seenBefore = signal(Number.MAX_SAFE_INTEGER);

  async markSeen() {
    this.seenBefore.set(await firstValueFrom(this.seen$));
    if (!this.auth.hasKitchen()) {
      return;
    }
    return setDoc(doc(db, 'seen', this.kitchenId), {kollegietAt: serverTimestamp()}, {merge: true});
  }

  async markAktueltSeen() {
    if (!this.auth.hasKitchen()) {
      return;
    }
    return setDoc(doc(db, 'seen', this.kitchenId), {aktueltAt: serverTimestamp()}, {merge: true});
  }

  saveProfile(fields: Pick<Profile, 'emoji' | 'colour' | 'bio' | 'lends'>) {
    this.usage.act('profile');
    const batch = writeBatch(db);
    batch.set(doc(db, 'profiles', this.kitchenId), {...fields, updatedAt: serverTimestamp()});
    return bump(batch, 'kitchens').commit();
  }

  // A post, a reply (parentId) or a post for one kitchen (to). Moves the rate limit in the same batch.
  post(text: string, opts: {to?: string | null, parentId?: string | null} = {}) {
    this.usage.act(opts.parentId ? 'post-reply' : 'post');
    const kid = this.kitchenId;
    const batch = writeBatch(db);
    const ref = doc(collection(db, 'posts'));
    batch.set(ref, {kitchenId: kid, text, to: opts.to ?? null, parentId: opts.parentId ?? null, createdAt: serverTimestamp()});
    batch.set(doc(db, 'seen', kid), {lastPostAt: serverTimestamp(), lastPostId: ref.id}, {merge: true});
    return bump(batch, 'posts').commit();
  }

  // Taking back your own (for five minutes) needs no trace.
  takeBack(collectionName: HideableCollection, id: string) {
    this.usage.act('take-back');
    const batch = writeBatch(db);
    batch.delete(doc(db, collectionName, id));
    return pulsed(batch, collectionName).commit();
  }

  // A kitchen taking its own note off the board, to put up a new one: its managers may delete their
  // kitchen's posts at any time. Others' replies to it stay in Firestore but are no longer shown.
  takeDown(id: string) {
    this.usage.act('note-take-down');
    const batch = writeBatch(db);
    batch.delete(doc(db, 'posts', id));
    return pulsed(batch, 'posts').commit();
  }

  // Hiding (a manager of the author kitchen, or the maker): moved to hidden/ for the maker.
  // The copy is the stored document itself, not what the screen shows: the rules require it to match.
  async hide(collectionName: HideableCollection, item: {id: string}, authorKitchenId: string) {
    this.usage.act('hide');
    const ref = doc(db, collectionName, item.id);
    const stored = await getDoc(ref);
    if (!stored.exists()) {
      return;
    }
    const batch = writeBatch(db);
    batch.set(doc(db, 'hidden', `${collectionName}_${item.id}`),
      {collection: collectionName, kitchenId: authorKitchenId, data: stored.data(), hiddenAt: serverTimestamp()});
    batch.delete(ref);
    return pulsed(batch, collectionName).commit();
  }

  // The maker's side: technical notes from ops/league.js (a tally that was off, an achievement
  // taken back), with what they point at.
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
    this.usage.act('event');
    const batch = writeBatch(db);
    const ref = doc(collection(db, 'events'));
    batch.set(ref, {...fields, kitchenId: this.kitchenId, rsvp: {}, createdAt: serverTimestamp()});
    return bump(batch, 'events').commit().then(() => ref);
  }

  updateEvent(e: KEvent, fields: EventFields) {
    this.usage.act('event-edit');
    const batch = writeBatch(db);
    batch.update(doc(db, 'events', e.id), {...fields});
    return bump(batch, 'events').commit();
  }

  rsvp(e: Pick<KEvent, 'id'>, answer: Rsvp | null) {
    this.usage.act('rsvp');
    const batch = writeBatch(db);
    batch.update(doc(db, 'events', e.id), {[`rsvp.${this.kitchenId}`]: answer ?? deleteField()});
    return bump(batch, 'events').commit();
  }

  // "Kom over nu": a call to every kitchen, from now for a few hours. Each kitchen has one call
  // document, written over by its next call once the last has ended.
  startLiveCall(title: string, place: string, hours: number) {
    this.usage.act('live-call');
    const now = Date.now();
    const batch = writeBatch(db);
    batch.set(doc(db, 'events', liveCallId(this.kitchenId)), {kind: 'live', title, text: '', place, invited: 'all',
      startsAt: Timestamp.fromMillis(now), endsAt: Timestamp.fromMillis(now + Math.min(hours, LIVE_HOURS_MAX) * 3600e3),
      kitchenId: this.kitchenId, rsvp: {}, createdAt: serverTimestamp()});
    return bump(batch, 'events').commit();
  }

  // The kitchen's last call, ended or not: when it may call again.
  myLastCall() {
    return getDoc(doc(db, 'events', liveCallId(this.kitchenId))).then(d => d.exists() ? {id: d.id, ...d.data()} as KEvent : null);
  }

  // The party is over: the call ends now.
  // Never later than it was set to end (the rules check it), so a second tap is harmless.
  endLiveCall(e: KEvent) {
    this.usage.act('live-call-end');
    const end = Math.min(millis(e.endsAt), Math.max(Date.now(), millis(e.startsAt) + 1000));
    const batch = writeBatch(db);
    batch.update(doc(db, 'events', e.id), {endsAt: Timestamp.fromMillis(end)});
    return bump(batch, 'events').commit();
  }

  highfive(to: string) {
    this.usage.act('highfive');
    const from = this.kitchenId;
    const batch = writeBatch(db);
    batch.set(doc(db, 'kudos', highfiveId(from, to, dayKey(new Date()))),
      {from, to, kind: 'highfive', badge: null, reason: '', createdAt: serverTimestamp()});
    return bump(batch, 'kudos').commit();
  }

  giveBadge(to: string, badge: Badge, reason: string) {
    this.usage.act('badge');
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'kudos')), {from: this.kitchenId, to, kind: 'badge', badge, reason, createdAt: serverTimestamp()});
    return bump(batch, 'kudos').commit();
  }

  // Two open at a time: the poll takes a free place in pollSlots/{kid} in the same batch (the rules
  // check the place's last poll has closed). Refused if both places hold an open one.
  async createPoll(title: string, opensAt: Date, closesAt: Date) {
    this.usage.act('poll');
    const kid = this.kitchenId;
    const slotsRef = doc(db, 'pollSlots', kid);
    const slots = (await getDoc(slotsRef)).data() ?? {};
    let free: string | null = null;
    for (const slot of POLL_SLOTS) {
      const held = slots[slot];
      const poll = held ? await getDoc(doc(db, 'polls', held)) : null;
      if (!poll?.exists() || millis(poll.get('closesAt')) <= Date.now()) {
        free = slot;
        break;
      }
    }
    if (!free) {
      throw new Error('two at a time');
    }
    const ref = doc(collection(db, 'polls'));
    const batch = writeBatch(db);
    batch.set(ref, {kitchenId: kid, title, opensAt: Timestamp.fromDate(opensAt), closesAt: Timestamp.fromDate(closesAt), createdAt: serverTimestamp()});
    batch.set(slotsRef, {[free]: ref.id}, {merge: true});
    return batch.commit();
  }

  // Ends the kitchen's own poll now: counted, or cancelled with no result. Frees its place.
  closePoll(poll: Poll, cancel: boolean) {
    this.usage.act('poll-close');
    return updateDoc(doc(db, 'polls', poll.id), {closesAt: serverTimestamp(), ...(cancel ? {cancelled: true} : {})});
  }

  // The kitchen's own vote: the only one it may read.
  myBallot(poll: Poll): Observable<string | null> {
    return watchDoc<{choice: string}>(doc(db, 'polls', poll.id, 'ballots', this.kitchenId)).pipe(map(b => b?.choice ?? null));
  }

  vote(poll: Poll, choice: string | null) {
    this.usage.act('vote');
    const ref = doc(db, 'polls', poll.id, 'ballots', this.kitchenId);
    return choice ? setDoc(ref, {choice, at: serverTimestamp()}) : deleteDoc(ref);
  }
}

// A removal in a collection the rest of the app keeps (posts, events, kudos, battles) moves its pulse.
function pulsed(batch: WriteBatch, collectionName: HideableCollection): WriteBatch {
  const kind: Partial<Record<HideableCollection, PulseKind>> = {posts: 'posts', events: 'events', kudos: 'kudos', battles: 'battles'};
  return kind[collectionName] ? bump(batch, kind[collectionName]!) : batch;
}
