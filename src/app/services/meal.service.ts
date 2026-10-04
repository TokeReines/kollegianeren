import {Injectable, inject} from '@angular/core';
import {arrayRemove, arrayUnion, deleteDoc, deleteField, doc, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch} from 'firebase/firestore';
import {getDoc, getDocs} from '../read-meter';
import {Observable} from 'rxjs';
import {BILL_PRODUCT, Meal, MealFields, billProductId, dayKey, splitBill} from '../interfaces/meal';
import {Purchase} from '../interfaces/purchase';
import {User} from '../interfaces/user';
import {PurchaseService} from './purchase.service';
import {db} from '../firebase';
import {AuthService} from './auth.service';
import {LeagueService} from './league.service';
import {isPlantMeal} from '../interfaces/kollegiet';
import {kitchenCollection, watchInKitchen} from './kitchen-data';
import {UsageService} from './usage.service';

// The food club's meals in the signed-in kitchen.
@Injectable({providedIn: 'root'})
export class MealService {
  private readonly usage = inject(UsageService);
  private readonly auth = inject(AuthService);
  // Food club battles move with bookings and sign-ups (docs/kollegiet.md, Battles).
  private readonly league = inject(LeagueService);
  private readonly purchases = inject(PurchaseService);

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
    this.usage.act('meal-add');
    const day = dayKey(fields.date.toDate());
    const signups = [...new Set(fields.cooks)];
    return setDoc(doc(this.meals(), day), {...fields, day, signups, createdAt: serverTimestamp()})
      .then(() => this.league.onMeal({date: fields.date, tags: fields.tags, signups}, 1));
  }

  // Resolves false, and changes nothing, when the meal would move onto a day that is taken.
  async update(meal: Meal, fields: MealFields): Promise<boolean> {
    this.usage.act('meal-edit');
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
    // A split bill moves with it (its purchases keep the product id it was split under).
    batch.set(target, {...fields, day, signups: [...new Set([...meal.signups, ...fields.cooks])], createdAt: serverTimestamp(),
      ...(meal.bill ? {bill: meal.bill} : {})});
    batch.delete(doc(this.meals(), meal.id));
    await batch.commit();
    return true;
  }

  // Another cook on the same day; cooks eat too.
  async addCook(meal: Meal, residentId: string) {
    this.usage.act('meal-cook');
    await updateDoc(doc(this.meals(), meal.id), {cooks: arrayUnion(residentId), signups: arrayUnion(residentId)});
    if (!meal.signups.includes(residentId)) {
      this.league.onDiner(meal, 1);
    }
  }

  // One resident in or out. arrayUnion/arrayRemove, so two tablets signing up at once both count.
  async setSignup(meal: Meal, residentId: string, eats: boolean) {
    this.usage.act(eats ? 'meal-signup' : 'meal-signoff');
    await updateDoc(doc(this.meals(), meal.id), {signups: eats ? arrayUnion(residentId) : arrayRemove(residentId)});
    if (eats !== meal.signups.includes(residentId)) {
      this.league.onDiner(meal, eats ? 1 : -1);
    }
  }

  // The shopping split between the eaters, into Regnskab: a purchase of "Madklub" each, and the
  // whole bill back to who paid (splitBill), with the meal marked in the same batch so it is split once.
  splitBill(meal: Meal, total: number, paidBy: string, residents: Map<string, User>) {
    this.usage.act('meal-bill');
    const purchases = kitchenCollection(this.auth.currentKitchenId, 'purchases');
    const batch = writeBatch(db);
    const lines = splitBill(total, meal.signups, paidBy);
    for (const l of lines) {
      const u = residents.get(l.userId);
      batch.set(doc(purchases), {
        productId: billProductId(meal), productName: BILL_PRODUCT, amount: l.amount, price: l.price,
        userId: l.userId, userName: u?.name ?? '', userRoom: u?.room ?? null, timestamp: serverTimestamp(),
      });
    }
    batch.update(doc(this.meals(), meal.id), {
      bill: {productId: billProductId(meal), total, paidBy, eaters: meal.signups.length, share: Math.floor(Math.round(total * 100) / meal.signups.length) / 100, at: serverTimestamp()},
    });
    return batch.commit();
  }

  // Back out of Regnskab (a wrong amount): the dinner's purchases taken back with their notes.
  async undoBill(meal: Meal) {
    this.usage.act('meal-bill-undo');
    const kid = this.auth.currentKitchenId;
    const lines = await getDocs(query(kitchenCollection(kid, 'purchases'), where('productId', '==', meal.bill?.productId ?? billProductId(meal))));
    const batch = writeBatch(db);
    lines.docs.forEach(d => this.purchases.takeBack(batch, {id: d.id, ...d.data()} as Purchase));
    batch.update(doc(this.meals(), meal.id), {bill: deleteField()});
    return batch.commit();
  }

  async delete(meal: Meal) {
    this.usage.act('meal-delete');
    await deleteDoc(doc(this.meals(), meal.id));
    this.league.onMeal(meal, -1);
  }
}
