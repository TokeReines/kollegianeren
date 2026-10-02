import {Injectable, inject} from '@angular/core';
import {addDoc, deleteDoc, doc, updateDoc} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {User, UserFields} from '../interfaces/user';
import {AuthService} from './auth.service';
import {kitchenCollection, watchInKitchen} from './kitchen-data';
import {UsageService} from './usage.service';

// Residents of the signed-in kitchen (the `users` collection).
@Injectable({providedIn: 'root'})
export class UserService {
  private readonly usage = inject(UsageService);
  private readonly auth = inject(AuthService);

  private users() {
    return kitchenCollection(this.auth.currentKitchenId, 'users');
  }

  list(): Observable<User[]> {
    return watchInKitchen<User>(this.auth.kitchenId$, kid => kitchenCollection(kid, 'users'));
  }

  add(user: UserFields) {
    this.usage.act('resident-add');
    return addDoc(this.users(), {...user, kitchen: this.auth.currentKitchenId});
  }

  update(user: User, fields: Partial<UserFields>) {
    this.usage.act('resident-edit');
    return updateDoc(doc(this.users(), user.id), fields);
  }

  delete(user: User) {
    this.usage.act('resident-delete');
    return deleteDoc(doc(this.users(), user.id));
  }
}
