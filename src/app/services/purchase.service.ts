import {Injectable} from '@angular/core';
import {AngularFirestore, AngularFirestoreCollection} from '@angular/fire/compat/firestore';
import {AuthService} from './auth.service';
import {Observable} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import {Purchase} from '../interfaces/purchase';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

@Injectable({
  providedIn: 'root'
})
export class PurchaseService {
  _purchases: AngularFirestoreCollection<Purchase>;
  _root: any;

  constructor(private afs: AngularFirestore, private auth: AuthService) {
    this.auth.user.subscribe(
      (user) => {
        if (!user) {
          return;
        }
        this._root = this.afs.collection<Purchase>('kitchens').doc(user.uid);
        this._purchases = this._root.collection('purchases');
      }
    );
  }

  private purchases(query?) {
    return this.auth.kitchenId.pipe(
      map(uid => this.afs.collection('kitchens').doc(uid).collection<Purchase>('purchases', query)));
  }

  list() {
    return this.purchases().pipe(switchMap(c => c.snapshotChanges()),
      map(actions => actions.map(a => {
        const data = a.payload.doc.data() as Purchase;
        const id = a.payload.doc.id;
        return {id, ...data} as Purchase;
      }))
    );
  }

  list_from_to(from: Date, to: Date) {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    return this.purchases(ref => ref.where('timestamp', '>=', from).where('timestamp', '<', to))
      .pipe(switchMap(c => c.valueChanges())) as Observable<Purchase[]>;
  }

  list_newest(limit = 30) {
    return this.purchases(ref => ref.orderBy('timestamp', 'desc').limit(limit)).pipe(
      switchMap(c => c.snapshotChanges()),
      map(actions => actions.map(a => {
        const data = a.payload.doc.data() as Purchase;
        const id = a.payload.doc.id;
        return {id, ...data} as Purchase;
      }))
    );
  }

  update(purchase: Purchase) {
    this._purchases.doc(purchase.id).update(purchase);
  }

  delete(purchase: Purchase) {
    this._purchases.doc(purchase.id).delete();
  }

  add(purchase: Purchase) {
    purchase.timestamp = firebase.firestore.FieldValue.serverTimestamp();
    this._purchases.add(purchase);
  }
}
