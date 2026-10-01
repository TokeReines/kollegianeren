import {Injectable, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {
  Timestamp, addDoc, collection, collectionGroup, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import {NEWS_DAYS} from '../interfaces/kollegiet';
import {Observable, combineLatest, from, map, of, shareReplay, switchMap} from 'rxjs';
import {Kitchen} from '../interfaces/kitchen';
import {Announcement, Message, Thread, newestFirst, toThreads} from '../interfaces/message';
import {AuthService} from './auth.service';
import {db, snapshotOptions, watch} from '../firebase';
import {kitchenCollection, watchInKitchen} from './kitchen-data';

// Everything between the kitchens and the maker: announcements ("Aktuelt"), one message
// thread per kitchen, and the maker's inbox. Admins are users with an admins/{uid} document,
// which only the Firebase console can create.
@Injectable({providedIn: 'root'})
export class MakerService {
  private readonly auth = inject(AuthService);

  readonly isAdmin$: Observable<boolean> = this.auth.user$.pipe(
    switchMap(user => user ? from(getDoc(doc(db, 'admins', user.uid)).then(d => d.exists(), () => false)) : of(false)),
    shareReplay(1),
  );
  readonly isAdmin = toSignal(this.isAdmin$, {initialValue: false});

  announcements(): Observable<Announcement[]> {
    return watchInKitchen<Announcement>(this.auth.kitchenId$, () => query(collection(db, 'announcements'), orderBy('createdAt', 'desc')));
  }

  // The newest posts on Aktuelt, for the notifications. Few and small, one shared listener.
  readonly recentAnnouncements$: Observable<Announcement[]> = watchInKitchen<Announcement>(this.auth.kitchenId$,
    () => query(collection(db, 'announcements'), where('createdAt', '>', Timestamp.fromMillis(Date.now() - NEWS_DAYS * 864e5)),
      orderBy('createdAt', 'desc'), limit(10))).pipe(shareReplay({bufferSize: 1, refCount: true}));

  postAnnouncement(title: string, body: string) {
    return addDoc(collection(db, 'announcements'), {title, body, createdAt: serverTimestamp()});
  }

  // The signed-in kitchen's thread with the maker, oldest first.
  thread(): Observable<Message[]> {
    return watchInKitchen<Message>(this.auth.kitchenId$, kid => query(kitchenCollection(kid, 'messages'), orderBy('createdAt')));
  }

  // The maker's messages the kitchen has not read yet, newest first. One listener, shared by the
  // menu badge and the banner on the buy page.
  readonly unreadByKitchen$: Observable<Message[]> = watchInKitchen<Message>(this.auth.kitchenId$,
    kid => query(kitchenCollection(kid, 'messages'), where('seenByKitchen', '==', false))).pipe(
    map(list => newestFirst(list)),
    shareReplay({bufferSize: 1, refCount: true}),
  );

  unreadForKitchen(): Observable<number> {
    return this.unreadByKitchen$.pipe(map(m => m.length));
  }

  send(text: string) {
    return addDoc(kitchenCollection(this.auth.currentKitchenId, 'messages'),
      {text, from: 'kitchen', createdAt: serverTimestamp(), seenByMaker: false, seenByKitchen: true});
  }

  async markSeenByKitchen(messages: Message[]) {
    return this.markSeen(this.auth.currentKitchenId, messages.filter(m => !m.seenByKitchen), {seenByKitchen: true});
  }

  // Maker side: every kitchen's thread, newest activity first. Messages are few, so one
  // collection-group listener without ordering (no extra index) is enough.
  inbox(): Observable<Thread[]> {
    return this.isAdmin$.pipe(
      switchMap(admin => admin ? combineLatest([watch<Kitchen>(collection(db, 'kitchens')), messagesWithKitchen()]) : of([[], []] as [Kitchen[], Message[]])),
      map(([kitchens, messages]) => toThreads(kitchens, messages)),
    );
  }

  reply(kitchenId: string, text: string) {
    return addDoc(kitchenCollection(kitchenId, 'messages'),
      {text, from: 'maker', createdAt: serverTimestamp(), seenByMaker: true, seenByKitchen: false});
  }

  async markSeenByMaker(thread: Thread) {
    return this.markSeen(thread.kitchenId, thread.messages.filter(m => !m.seenByMaker), {seenByMaker: true});
  }

  private async markSeen(kitchenId: string, unseen: Message[], seen: Partial<Message>) {
    if (!unseen.length) {
      return;
    }
    const batch = writeBatch(db);
    unseen.forEach(m => batch.update(doc(kitchenCollection(kitchenId, 'messages'), m.id), seen));
    return batch.commit();
  }
}

function messagesWithKitchen(): Observable<Message[]> {
  return new Observable<Message[]>(subscriber => onSnapshot(collectionGroup(db, 'messages'),
    snap => subscriber.next(snap.docs.map(d => ({id: d.id, kitchenId: d.ref.parent.parent?.id, ...d.data(snapshotOptions)}) as Message)),
    err => subscriber.error(err)));
}

