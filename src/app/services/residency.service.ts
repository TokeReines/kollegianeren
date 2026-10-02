import {Injectable, inject} from '@angular/core';
import {doc, query, serverTimestamp, updateDoc, where, writeBatch} from 'firebase/firestore';
import {getDocs} from '../read-meter';
import {AuthService} from './auth.service';
import {User} from '../interfaces/user';
import {Purchase} from '../interfaces/purchase';
import {db} from '../firebase';
import {ANONYMOUS_NAME, ResidentSummary, summarise} from './residency';
import {kitchenCollection} from './kitchen-data';
import {UsageService} from './usage.service';

// Moving residents in and out, and anonymising them after they have left (privacy note: /privacy).
@Injectable({providedIn: 'root'})
export class ResidencyService {
  private readonly usage = inject(UsageService);
  private readonly auth = inject(AuthService);

  private resident(user: User) {
    return doc(kitchenCollection(this.auth.currentKitchenId, 'users'), user.id);
  }

  // Only filters on userId: adding a date filter would need a composite index on prod.
  private async purchasesOf(user: User) {
    const purchases = kitchenCollection(this.auth.currentKitchenId, 'purchases');
    return (await getDocs(query(purchases, where('userId', '==', user.id)))).docs;
  }

  async summary(user: User): Promise<ResidentSummary> {
    return summarise((await this.purchasesOf(user)).map(d => d.data() as Purchase));
  }

  moveOut(user: User) {
    this.usage.act('move-out');
    return updateDoc(this.resident(user), {active: false, movedOutAt: serverTimestamp()});
  }

  moveIn(user: User) {
    this.usage.act('move-in');
    return updateDoc(this.resident(user), {active: true, movedOutAt: null});
  }

  // Replaces the resident's name, room and photo, also on the purchases that copy them.
  // Amounts and dates stay, so the kitchen's accounts still add up.
  async anonymise(user: User): Promise<number> {
    this.usage.act('anonymise');
    const docs = await this.purchasesOf(user);
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      docs.slice(i, i + 400).forEach(d => batch.update(d.ref, {userName: ANONYMOUS_NAME, userRoom: null}));
      await batch.commit();
    }
    await updateDoc(this.resident(user), {name: ANONYMOUS_NAME, room: '', image: '', clId: '', active: false, anonymisedAt: serverTimestamp()});
    return docs.length;
  }
}
