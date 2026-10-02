import {Injectable, inject} from '@angular/core';
import {signInAnonymously} from 'firebase/auth';
import {collection, deleteDoc, doc, query, serverTimestamp, setDoc, where} from 'firebase/firestore';
import {getDoc, getDocs} from '../read-meter';
import {AuthService} from './auth.service';
import {newCode} from '../interfaces/invite';
import {User} from '../interfaces/user';
import {Purchase} from '../interfaces/purchase';
import {auth, db} from '../firebase';
import {millis} from '../time';
import {kitchenCollection} from './kitchen-data';

export interface ResidentTab {
  name: string;
  room: string;
  // Newest first.
  purchases: Purchase[];
}

export function residentLink(token: string): string {
  return `${location.origin}/me/${token}`;
}

// Resident self-view: a private link per resident to see their own tab on their phone, without a
// kitchen login. Opening it signs in anonymously and registers the token; the rules then allow
// reading exactly that resident's name and purchases.
@Injectable({providedIn: 'root'})
export class ResidentLinkService {
  private readonly auth = inject(AuthService);

  private existing(user: User) {
    return getDocs(query(collection(db, 'residentLinks'), where('kitchenId', '==', this.auth.currentKitchenId), where('userId', '==', user.id)));
  }

  // The resident's current link, created if there is none.
  async linkFor(user: User): Promise<string> {
    const existing = await this.existing(user);
    if (!existing.empty) {
      return existing.docs[0].id;
    }
    const token = newCode(24);
    await setDoc(doc(db, 'residentLinks', token), {
      kitchenId: this.auth.currentKitchenId, userId: user.id, createdBy: auth.currentUser?.uid, createdAt: serverTimestamp(),
    });
    return token;
  }

  // Old links stop working; a new one is made.
  async renew(user: User): Promise<string> {
    const existing = await this.existing(user);
    await Promise.all(existing.docs.map(d => deleteDoc(d.ref)));
    return this.linkFor(user);
  }

  async open(token: string): Promise<ResidentTab | null> {
    const link = await getDoc(doc(db, 'residentLinks', token));
    if (!link.exists()) {
      return null;
    }
    const session = auth.currentUser ?? (await signInAnonymously(auth)).user;
    await setDoc(doc(db, 'linkSessions', session.uid), {token});
    const {kitchenId, userId} = link.data() as {kitchenId: string, userId: string};
    const [resident, purchases] = await Promise.all([
      getDoc(doc(kitchenCollection(kitchenId, 'users'), userId)),
      // Filter on userId only: a date filter would need a composite index on prod.
      getDocs(query(kitchenCollection(kitchenId, 'purchases'), where('userId', '==', userId))),
    ]);
    return {
      name: resident.get('name') || '',
      room: resident.get('room') || '',
      purchases: purchases.docs.map(d => d.data() as Purchase).sort((a, b) => millis(b.timestamp) - millis(a.timestamp)),
    };
  }
}
