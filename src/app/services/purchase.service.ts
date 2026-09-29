import {Injectable} from '@angular/core';
import {
  DocumentReference, QueryConstraint, addDoc, collection, deleteDoc, doc, limit as limitTo, orderBy, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {switchMap} from 'rxjs/operators';
import {Purchase} from '../interfaces/purchase';
import {AuthService} from './auth.service';
import {db, watch} from '../firebase';

@Injectable({
  providedIn: 'root'
})
export class PurchaseService {

  constructor(private auth: AuthService) {
  }

  private purchases(uid = this.auth.currentKitchenId) {
    return collection(db, 'kitchens', uid, 'purchases');
  }

  private watchQuery(...constraints: QueryConstraint[]): Observable<Purchase[]> {
    return this.auth.kitchenId.pipe(switchMap(uid => watch<Purchase>(query(this.purchases(uid), ...constraints))));
  }

  list() {
    return this.watchQuery();
  }

  list_from_to(from: Date, to: Date) {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    return this.watchQuery(where('timestamp', '>=', from), where('timestamp', '<', to));
  }

  list_newest(limit = 30) {
    return this.watchQuery(orderBy('timestamp', 'desc'), limitTo(limit));
  }

  update(purchase: Purchase) {
    return updateDoc(doc(this.purchases(), purchase.id), {...purchase});
  }

  delete(purchase: Purchase) {
    return deleteDoc(doc(this.purchases(), purchase.id));
  }

  deleteRef(ref: DocumentReference) {
    return deleteDoc(ref);
  }

  add(purchase: Purchase) {
    return addDoc(this.purchases(), {...purchase, timestamp: serverTimestamp()});
  }
}
