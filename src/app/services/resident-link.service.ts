import {Injectable} from '@angular/core';
import {signInAnonymously} from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';
import {AuthService} from './auth.service';
import {newCode} from './access.service';
import {User} from '../interfaces/user';
import {Purchase} from '../interfaces/purchase';
import {auth, db} from '../firebase';

export interface ResidentTab {
  name: string;
  room: string;
  purchases: Purchase[];
}

export function residentLink(token: string): string {
  return `${location.origin}/me/${token}`;
}

// Resident self-view: a private link per resident to see their own tab on their phone, without a
// kitchen login. Opening it signs in anonymously and registers the token; the rules then allow
// reading exactly that resident's name and purchases.
@Injectable({
  providedIn: 'root'
})
export class ResidentLinkService {

  constructor(private auth: AuthService) {
  }

  // The resident's current link, created if there is none.
  async linkFor(user: User): Promise<string> {
    const kid = this.auth.currentKitchenId;
    const existing = await getDocs(query(collection(db, 'residentLinks'), where('kitchenId', '==', kid), where('userId', '==', user.id)));
    if (!existing.empty) {
      return existing.docs[0].id;
    }
    const token = newCode(24);
    await setDoc(doc(db, 'residentLinks', token), {kitchenId: kid, userId: user.id, createdBy: auth.currentUser.uid, createdAt: serverTimestamp()});
    return token;
  }

  // Old links stop working; a new one is made.
  async renew(user: User): Promise<string> {
    const kid = this.auth.currentKitchenId;
    const existing = await getDocs(query(collection(db, 'residentLinks'), where('kitchenId', '==', kid), where('userId', '==', user.id)));
    await Promise.all(existing.docs.map(d => deleteDoc(d.ref)));
    return this.linkFor(user);
  }

  async open(token: string): Promise<ResidentTab | null> {
    const link = await getDoc(doc(db, 'residentLinks', token));
    if (!link.exists()) {
      return null;
    }
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
    await setDoc(doc(db, 'linkSessions', auth.currentUser.uid), {token});
    const {kitchenId, userId} = link.data();
    const [resident, purchases] = await Promise.all([
      getDoc(doc(db, 'kitchens', kitchenId, 'users', userId)),
      // Filter on userId only: a date filter would need a composite index on prod.
      getDocs(query(collection(db, 'kitchens', kitchenId, 'purchases'), where('userId', '==', userId))),
    ]);
    return {
      name: resident.get('name') || '',
      room: resident.get('room') || '',
      purchases: purchases.docs.map(d => d.data() as Purchase)
        .sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0)),
    };
  }
}
