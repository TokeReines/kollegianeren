import {Injectable} from '@angular/core';
import {collection, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch} from 'firebase/firestore';
import {AuthService} from './auth.service';
import {User} from '../interfaces/user';
import {Purchase} from '../interfaces/purchase';
import {db} from '../firebase';

// How long moved-out residents keep their name on purchases before the app offers to anonymise them.
export const RETENTION_MONTHS = 12;
export const ANONYMOUS_NAME = 'Tidligere beboer';

export interface ResidentSummary {
  last12Months: number;
  thisMonth: number;
  purchases: number;
}

// Moving residents in and out, and anonymising them after they have left (privacy note: /privacy).
@Injectable({
  providedIn: 'root'
})
export class ResidencyService {

  constructor(private auth: AuthService) {
  }

  // Only filters on userId: adding a date filter would need a composite index on prod.
  private async purchasesOf(user: User) {
    const kid = this.auth.currentKitchenId;
    return (await getDocs(query(collection(db, 'kitchens', kid, 'purchases'), where('userId', '==', user.id)))).docs;
  }

  async summary(user: User): Promise<ResidentSummary> {
    const docs = await this.purchasesOf(user);
    const now = new Date();
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let last12Months = 0, thisMonth = 0;
    for (const d of docs) {
      const p = d.data() as Purchase;
      const t = p.timestamp?.toMillis?.() || 0;
      const price = Number(p.price) || 0;
      if (t >= yearAgo) {
        last12Months += price;
      }
      if (t >= monthStart) {
        thisMonth += price;
      }
    }
    return {last12Months, thisMonth, purchases: docs.length};
  }

  moveOut(user: User) {
    return updateDoc(doc(db, 'kitchens', this.auth.currentKitchenId, 'users', user.id), {active: false, movedOutAt: serverTimestamp()});
  }

  moveIn(user: User) {
    return updateDoc(doc(db, 'kitchens', this.auth.currentKitchenId, 'users', user.id), {active: true, movedOutAt: null});
  }

  isDueForAnonymising(user: User): boolean {
    const out = user.movedOutAt?.toMillis?.();
    if (!out || user.anonymisedAt) {
      return false;
    }
    const due = new Date(out);
    due.setMonth(due.getMonth() + RETENTION_MONTHS);
    return Date.now() >= due.getTime();
  }

  // Replaces the resident's name, room and photo, also on the purchases that copy them.
  // Amounts and dates stay, so the kitchen's accounts still add up.
  async anonymise(user: User) {
    const kid = this.auth.currentKitchenId;
    const docs = await this.purchasesOf(user);
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      docs.slice(i, i + 400).forEach(d => batch.update(d.ref, {userName: ANONYMOUS_NAME, userRoom: null}));
      await batch.commit();
    }
    await updateDoc(doc(db, 'kitchens', kid, 'users', user.id),
      {name: ANONYMOUS_NAME, room: '', image: '', clId: '', active: false, anonymisedAt: serverTimestamp()});
    return docs.length;
  }
}
