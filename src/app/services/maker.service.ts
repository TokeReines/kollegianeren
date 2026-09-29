import {Injectable} from '@angular/core';
import {
  addDoc, collection, collectionGroup, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import {Observable, combineLatest, from, of} from 'rxjs';
import {map, shareReplay, switchMap} from 'rxjs/operators';
import {AuthService} from './auth.service';
import {db, watch} from '../firebase';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: any;
}

export interface Message {
  id: string;
  kitchenId?: string;
  text: string;
  from: 'kitchen' | 'maker';
  createdAt: any;
  seenByMaker: boolean;
  seenByKitchen: boolean;
}

export interface Thread {
  kitchenId: string;
  kitchenName: string;
  messages: Message[];
  unread: number;
  lastAt: number;
}

// Everything between the kitchens and the maker: announcements ("Aktuelt"), one message
// thread per kitchen, and the maker's inbox. Admins are users with an admins/{uid} document,
// which only the Firebase console can create.
@Injectable({
  providedIn: 'root'
})
export class MakerService {

  isAdmin: Observable<boolean> = this.auth.user.pipe(
    switchMap(user => user ? from(getDoc(doc(db, 'admins', user.uid)).then(d => d.exists(), () => false)) : of(false)),
    shareReplay(1),
  );

  constructor(private auth: AuthService) {
  }

  announcements(): Observable<Announcement[]> {
    return this.auth.kitchenId.pipe(
      switchMap(() => watch<Announcement>(query(collection(db, 'announcements'), orderBy('createdAt', 'desc')))));
  }

  postAnnouncement(title: string, body: string) {
    return addDoc(collection(db, 'announcements'), {title, body, createdAt: serverTimestamp()});
  }

  // The signed-in kitchen's thread with the maker, oldest first.
  thread(): Observable<Message[]> {
    return this.auth.kitchenId.pipe(switchMap(uid =>
      watch<Message>(query(collection(db, 'kitchens', uid, 'messages'), orderBy('createdAt')))));
  }

  unreadForKitchen(): Observable<number> {
    return this.auth.kitchenId.pipe(switchMap(uid =>
      watch<Message>(query(collection(db, 'kitchens', uid, 'messages'), where('seenByKitchen', '==', false)))),
      map(m => m.length));
  }

  send(text: string) {
    const uid = this.auth.currentKitchenId;
    return addDoc(collection(db, 'kitchens', uid, 'messages'),
      {text, from: 'kitchen', createdAt: serverTimestamp(), seenByMaker: false, seenByKitchen: true});
  }

  markSeenByKitchen(messages: Message[]) {
    const unseen = messages.filter(m => !m.seenByKitchen);
    if (!unseen.length) {
      return Promise.resolve();
    }
    const uid = this.auth.currentKitchenId;
    const batch = writeBatch(db);
    unseen.forEach(m => batch.update(doc(db, 'kitchens', uid, 'messages', m.id), {seenByKitchen: true}));
    return batch.commit();
  }

  // Maker side: every kitchen's thread, newest activity first. Messages are few, so one
  // collection-group listener without ordering (no extra index) is enough.
  inbox(): Observable<Thread[]> {
    const kitchens = watch<{id: string, name: string}>(collection(db, 'kitchens'));
    return this.isAdmin.pipe(
      switchMap(admin => admin ? combineLatest([kitchens, this.messagesWithKitchen()]) : of([[], []] as [any[], Message[]])),
      map(([ks, ms]) => {
        const names = new Map(ks.map(k => [k.id, k.name]));
        const byKitchen = new Map<string, Message[]>();
        ms.forEach(m => byKitchen.set(m.kitchenId, [...(byKitchen.get(m.kitchenId) || []), m]));
        return [...byKitchen.entries()].map(([kitchenId, list]) => {
          list.sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
          return {
            kitchenId, kitchenName: names.get(kitchenId) || kitchenId, messages: list,
            unread: list.filter(m => !m.seenByMaker).length, lastAt: millis(list[list.length - 1].createdAt),
          };
        }).sort((a, b) => b.lastAt - a.lastAt);
      }),
    );
  }

  private messagesWithKitchen(): Observable<Message[]> {
    return new Observable<Message[]>(subscriber => {
      return onSnapshot(collectionGroup(db, 'messages'),
        snap => subscriber.next(snap.docs.map(d => ({
          id: d.id, kitchenId: d.ref.parent.parent.id, ...d.data({serverTimestamps: 'estimate'}),
        }) as Message)),
        err => subscriber.error(err));
    });
  }

  reply(kitchenId: string, text: string) {
    return addDoc(collection(db, 'kitchens', kitchenId, 'messages'),
      {text, from: 'maker', createdAt: serverTimestamp(), seenByMaker: true, seenByKitchen: false});
  }

  markSeenByMaker(thread: Thread) {
    const unseen = thread.messages.filter(m => !m.seenByMaker);
    if (!unseen.length) {
      return Promise.resolve();
    }
    const batch = writeBatch(db);
    unseen.forEach(m => batch.update(doc(db, 'kitchens', thread.kitchenId, 'messages', m.id), {seenByMaker: true}));
    return batch.commit();
  }
}

export function millis(t: any): number {
  return t?.toMillis ? t.toMillis() : 0;
}
