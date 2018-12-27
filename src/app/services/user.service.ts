import { Injectable } from '@angular/core';
import {AngularFirestore, AngularFirestoreCollection} from '@angular/fire/firestore';
import {Product} from '../interfaces/product';
import {AuthService} from './auth.service';
import {User} from '../interfaces/user';
import {map} from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  _users: AngularFirestoreCollection<User>;

  constructor(private afs: AngularFirestore, private auth: AuthService) {
    this.auth.user.subscribe(
      (user) => {
        if (!user) {
          return;
        }
        this._users = this.afs.collection<Product>('kitchens').doc(user.uid).collection('users');
      }
    );
  }

  list() {
    return this._users.snapshotChanges()
      .pipe(
        map(actions => actions.map(a => {
          const data = a.payload.doc.data() as User;
          const id = a.payload.doc.id;
          return {id, ...data} as User;
        }))
      );
  }

  update(user: User) {
    this._users.doc(user.id).update(user);
  }

  delete(user: User) {
    this._users.doc(user.id).delete();
  }

  add(user: User) {
    this._users.add(user);
  }

}
