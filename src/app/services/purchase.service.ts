import {Injectable, inject} from '@angular/core';
import {DocumentReference, deleteDoc, doc, limit, orderBy, query, serverTimestamp, setDoc, where} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {NewPurchase, Purchase} from '../interfaces/purchase';
import {AuthService} from './auth.service';
import {kitchenCollection, watchInKitchen} from './kitchen-data';

@Injectable({providedIn: 'root'})
export class PurchaseService {
  private readonly auth = inject(AuthService);

  private purchases() {
    return kitchenCollection(this.auth.currentKitchenId, 'purchases');
  }

  // Purchases from the start of `from` to the end of `to`.
  between(from: Date, to: Date): Observable<Purchase[]> {
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
    return watchInKitchen<Purchase>(this.auth.kitchenId$, kid =>
      query(kitchenCollection(kid, 'purchases'), where('timestamp', '>=', start), where('timestamp', '<', end)));
  }

  newest(count = 30): Observable<Purchase[]> {
    return watchInKitchen<Purchase>(this.auth.kitchenId$, kid =>
      query(kitchenCollection(kid, 'purchases'), orderBy('timestamp', 'desc'), limit(count)));
  }

  // Returns the new document's ref right away (ids are made on the device) and a promise for the
  // server's acknowledgement, which only resolves once the tablet is online.
  add(purchase: NewPurchase): {ref: DocumentReference, saved: Promise<void>} {
    const ref = doc(this.purchases());
    return {ref, saved: setDoc(ref, {...purchase, timestamp: serverTimestamp()})};
  }

  delete(purchase: Purchase | DocumentReference) {
    return deleteDoc(purchase instanceof DocumentReference ? purchase : doc(this.purchases(), purchase.id));
  }
}
