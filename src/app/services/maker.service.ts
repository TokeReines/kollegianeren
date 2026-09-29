import {Injectable, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {
  addDoc, collection, collectionGroup, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import {Observable, combineLatest, from, map, of, shareReplay, switchMap} from 'rxjs';
import {Kitchen} from '../interfaces/kitchen';
import {Announcement, Message, Thread, toThreads} from '../interfaces/message';
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

  postAnnouncement(title: string, body: string) {
    return addDoc(collection(db, 'announcements'), {title, body, createdAt: serverTimestamp()});
  }

  // The signed-in kitchen's thread with the maker, oldest first.
  thread(): Observable<Message[]> {
    return watchInKitchen<Message>(this.auth.kitchenId$, kid => query(kitchenCollection(kid, 'messages'), orderBy('createdAt')));
  }

  unreadForKitchen(): Observable<number> {
    return watchInKitchen<Message>(this.auth.kitchenId$, kid => query(kitchenCollection(kid, 'messages'), where('seenByKitchen', '==', false)))
      .pipe(map(m => m.length));
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

