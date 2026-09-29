import {Injectable, inject} from '@angular/core';
import {addDoc, deleteDoc, doc, updateDoc} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {User, UserFields} from '../interfaces/user';
import {AuthService} from './auth.service';
import {kitchenCollection, watchInKitchen} from './kitchen-data';

// Residents of the signed-in kitchen (the `users` collection).
@Injectable({providedIn: 'root'})
export class UserService {
  private readonly auth = inject(AuthService);

  private users() {
    return kitchenCollection(this.auth.currentKitchenId, 'users');
  }

  list(): Observable<User[]> {
    return watchInKitchen<User>(this.auth.kitchenId$, kid => kitchenCollection(kid, 'users'));
  }

  add(user: UserFields) {
    return addDoc(this.users(), {...user, kitchen: this.auth.currentKitchenId});
  }

  update(user: User, fields: Partial<UserFields>) {
    return updateDoc(doc(this.users(), user.id), fields);
  }

  delete(user: User) {
    return deleteDoc(doc(this.users(), user.id));
  }
}
