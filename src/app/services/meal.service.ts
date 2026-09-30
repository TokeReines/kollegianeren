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

  // Meals from `from` up to `to`, soonest first: one week of the page, a handful of reads.
  between(from: Date, to: Date): Observable<Meal[]> {
    return watchInKitchen<Meal>(this.auth.kitchenId$, kid =>
      query(kitchenCollection(kid, 'meals'), where('date', '>=', from), where('date', '<', to), orderBy('date'), limit(50)));
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
