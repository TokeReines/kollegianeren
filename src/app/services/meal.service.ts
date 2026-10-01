import {Injectable, inject} from '@angular/core';
import {arrayRemove, arrayUnion, deleteDoc, doc, getDoc, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {Meal, MealFields, dayKey} from '../interfaces/meal';
import {db} from '../firebase';
import {AuthService} from './auth.service';
import {LeagueService} from './league.service';
import {isPlantMeal} from '../interfaces/kollegiet';
import {kitchenCollection, watchInKitchen} from './kitchen-data';

// The food club's meals in the signed-in kitchen.
@Injectable({providedIn: 'root'})
export class MealService {
  private readonly auth = inject(AuthService);
  // Food club battles move with bookings and sign-ups (docs/kollegiet.md, Battles).
  private readonly league = inject(LeagueService);

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
    const signups = [...new Set(fields.cooks)];
    return setDoc(doc(this.meals(), day), {...fields, day, signups, createdAt: serverTimestamp()})
      .then(() => this.league.onMeal({date: fields.date, tags: fields.tags, signups}, 1));
  }

  // Resolves false, and changes nothing, when the meal would move onto a day that is taken.
  async update(meal: Meal, fields: MealFields): Promise<boolean> {
    const day = dayKey(fields.date.toDate());
    if (day === meal.id) {
      // A cook added here eats too.
      await updateDoc(doc(this.meals(), meal.id), {...fields, signups: arrayUnion(...fields.cooks)});
      this.league.onDiner(meal, fields.cooks.filter(c => !meal.signups.includes(c)).length);
      this.league.onRetag(meal, isPlantMeal(meal.tags), isPlantMeal(fields.tags));
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
  async addCook(meal: Meal, residentId: string) {
    await updateDoc(doc(this.meals(), meal.id), {cooks: arrayUnion(residentId), signups: arrayUnion(residentId)});
    if (!meal.signups.includes(residentId)) {
      this.league.onDiner(meal, 1);
    }
  }

  // One resident in or out. arrayUnion/arrayRemove, so two tablets signing up at once both count.
  async setSignup(meal: Meal, residentId: string, eats: boolean) {
    await updateDoc(doc(this.meals(), meal.id), {signups: eats ? arrayUnion(residentId) : arrayRemove(residentId)});
    if (eats !== meal.signups.includes(residentId)) {
      this.league.onDiner(meal, eats ? 1 : -1);
    }
  }

  async delete(meal: Meal) {
    await deleteDoc(doc(this.meals(), meal.id));
    this.league.onMeal(meal, -1);
  }
}
