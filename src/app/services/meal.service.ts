import {Injectable, inject} from '@angular/core';
import {arrayRemove, arrayUnion, deleteDoc, doc, getDoc, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {Meal, MealFields, dayKey} from '../interfaces/meal';
import {db} from '../firebase';
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

  // The cook eats too. The day is the document id, so a day another tablet just took is refused
  // by the rules (it would be an update of that meal).
  add(fields: MealFields) {
    const day = dayKey(fields.date.toDate());
    return setDoc(doc(this.meals(), day), {...fields, day, signups: [...fields.cooks], createdAt: serverTimestamp()});
  }

  // Resolves false, and changes nothing, when the meal would move onto a day that is taken.
  async update(meal: Meal, fields: MealFields): Promise<boolean> {
    const day = dayKey(fields.date.toDate());
    if (day === meal.id) {
      // A cook added here eats too.
      await updateDoc(doc(this.meals(), meal.id), {...fields, signups: arrayUnion(...fields.cooks)});
      return true;
    }
    const target = doc(this.meals(), day);
    if ((await getDoc(target)).exists()) {
      return false;
    }
    const batch = writeBatch(db);
    batch.set(target, {...fields, day, signups: [...new Set([...meal.signups, ...fields.cooks])], createdAt: serverTimestamp()});
    batch.delete(doc(this.meals(), meal.id));
    await batch.commit();
    return true;
  }

  // Another cook on the same day; cooks eat too.
  addCook(meal: Meal, residentId: string) {
    return updateDoc(doc(this.meals(), meal.id), {cooks: arrayUnion(residentId), signups: arrayUnion(residentId)});
  }

  // One resident in or out. arrayUnion/arrayRemove, so two tablets signing up at once both count.
  setSignup(meal: Meal, residentId: string, eats: boolean) {
    return updateDoc(doc(this.meals(), meal.id), {signups: eats ? arrayUnion(residentId) : arrayRemove(residentId)});
  }

  delete(meal: Meal) {
    return deleteDoc(doc(this.meals(), meal.id));
  }
}
