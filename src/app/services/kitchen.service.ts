import {Injectable} from '@angular/core';
import {AngularFirestore, AngularFirestoreCollection} from '@angular/fire/firestore';
import {AuthService} from './auth.service';
import {Kitchen} from '../interfaces/kitchen';

@Injectable({
  providedIn: 'root'
})
export class KitchenService {
  _kitchens: AngularFirestoreCollection<Kitchen>;

  constructor(private afs: AngularFirestore, private auth: AuthService) {
    this._kitchens = this.afs.collection<Kitchen>('kitchens');
  }

  set(kitchen) {
    this._kitchens.doc(kitchen.id).set(kitchen);
  }

  list() {
    console.log(this._kitchens);
    return this._kitchens;
  }
}
