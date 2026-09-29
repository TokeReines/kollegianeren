import {Injectable} from '@angular/core';
import {addDoc, collection, deleteDoc, doc, updateDoc} from 'firebase/firestore';
import {switchMap} from 'rxjs/operators';
import {User} from '../interfaces/user';
import {AuthService} from './auth.service';
import {db, watch} from '../firebase';

// Residents of the signed-in kitchen (the `users` collection).
@Injectable({
  providedIn: 'root'
})
export class UserService {

  constructor(private auth: AuthService) {
  }

  private users(uid = this.auth.currentKitchenId) {
    return collection(db, 'kitchens', uid, 'users');
  }

  list() {
    return this.auth.kitchenId.pipe(switchMap(uid => watch<User>(this.users(uid))));
  }

  update(user: User) {
    return updateDoc(doc(this.users(), user.id), {...user});
  }

  delete(user: User) {
    return deleteDoc(doc(this.users(), user.id));
  }

  add(user: User) {
    return addDoc(this.users(), user);
  }
}
