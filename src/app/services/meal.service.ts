import {Injectable, inject} from '@angular/core';
import {addDoc, arrayRemove, arrayUnion, deleteDoc, doc, limit, orderBy, query, serverTimestamp, updateDoc, where} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {Meal, MealFields} from '../interfaces/meal';
import {AuthService} from './auth.service';
import {kitchenCollection, watchInKitchen} from './kitchen-data';

// The food club's meals in the signed-in kitchen.
@Injectable({providedIn: 'root'})
export class MealService {
  private readonly auth = inject(AuthService);

  private meals() {
    return kitchenCollection(this.auth.currentKitchenId, 'meals');
  }

  // Today's and coming meals, soonest first.
  upcoming(): Observable<Meal[]> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return watchInKitchen<Meal>(this.auth.kitchenId$, kid =>
      query(kitchenCollection(kid, 'meals'), where('date', '>=', today), orderBy('date'), limit(30)));
  }

  // The cook eats too.
  add(fields: MealFields) {
    return addDoc(this.meals(), {...fields, signups: [fields.cookId], createdAt: serverTimestamp()});
  }

  update(meal: Meal, fields: Partial<MealFields>) {
    return updateDoc(doc(this.meals(), meal.id), fields);
  }

  // One resident in or out. arrayUnion/arrayRemove, so two tablets signing up at once both count.
  setSignup(meal: Meal, residentId: string, eats: boolean) {
    return updateDoc(doc(this.meals(), meal.id), {signups: eats ? arrayUnion(residentId) : arrayRemove(residentId)});
  }

  delete(meal: Meal) {
    return deleteDoc(doc(this.meals(), meal.id));
  }
}
