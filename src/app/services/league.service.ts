import {Injectable, computed, inject, signal} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {
  Timestamp, arrayUnion, collection, doc, increment, limit, orderBy, query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import {getDoc} from '../read-meter';
import {Observable, catchError, combineLatest, interval, map, of, startWith, switchMap} from 'rxjs';
import {
  Achievement, BATTLE_SLOTS, Battle, Metric, TOO_MANY_BATTLES, Tally, addTick, during, earnedAchievements, isPlantMeal, liveFor,
  saleUnits,
} from '../interfaces/kollegiet';
import {Meal} from '../interfaces/meal';
import {Product} from '../interfaces/product';
import {db, watch, watchDoc} from '../firebase';
import {millis} from '../time';
import {AuthService} from './auth.service';
import {whileSignedIn} from './kitchen-data';
import {UsageService} from './usage.service';
import {PulseService, bump} from './pulse.service';

const DAY = 864e5;

export type BattleFields = Pick<Battle, 'title' | 'metric' | 'from' | 'to' | 'invited'>;

// Battles between the kitchens (docs/kollegiet.md, Battles). The kitchen's own tablets move its
// live tally next to the sale, food club sign-up or gym tap that caused it. That write is separate
// from the sale, so a battle ending mid-sale never blocks the sale; ops/league.js settles the end.
@Injectable({providedIn: 'root'})
export class LeagueService {
  private readonly usage = inject(UsageService);
  private readonly auth = inject(AuthService);

  // Battles that have not been over for more than two weeks: a handful of documents. Latest ending
  // first, so new battles keep coming in on a tablet that stays open for weeks.
  // Fetched when a battle is created, joined, called off or settled (pulse/kollegiet); the live
  // scores come from the tallies, which are listened to only for the kitchen's own live battles.
  readonly battles$: Observable<Battle[]> = inject(PulseService).list<Battle>('battles', () => query(collection(db, 'battles'),
    where('to', '>=', Timestamp.fromMillis(Date.now() - 14 * DAY)), orderBy('to', 'desc'), limit(40)));
  readonly battles = toSignal(this.battles$, {initialValue: []});

  // Ticks once a minute, so battles start and end on screen without a reload.
  readonly now = toSignal(interval(60e3).pipe(startWith(0), map(() => Date.now())), {initialValue: Date.now()});

  readonly myLive = computed(() => {
    const kid = this.auth.membership()?.kitchenId;
    return kid ? liveFor(this.battles(), kid, this.now()) : [];
  });

  // The kitchen's own tallies in its live battles, for the ticks and the achievements. Keyed on
  // the battle ids, so the minute tick does not reopen the listeners.
  private readonly myLiveIds = computed(() => this.myLive().map(b => b.id).join(','));
  private readonly myTallies = toSignal(combineLatest([toObservable(this.myLiveIds), this.auth.membership$]).pipe(
    switchMap(([ids, m]) => ids && m
      ? combineLatest(ids.split(',').map(id => watchDoc<Tally>(doc(db, 'battles', id, 'tally', m.kitchenId)).pipe(
        map(t => [id, t ?? undefined] as const), catchError(() => of([id, undefined] as const)))))
      : of([])),
    map(entries => new Map<string, Tally | undefined>(entries)),
  ), {initialValue: new Map<string, Tally | undefined>()});

  private readonly myAchievements = toSignal(whileSignedIn(this.auth.kitchen$,
    kid => watch<Achievement>(collection(db, 'standings', kid, 'achievements')), [] as Achievement[]).pipe(
    map(list => new Set(list.map(a => a.id))),
  ), {initialValue: new Set<string>()});

  // Achievements just claimed, for the pop-up on screens watching.
  readonly justEarned = signal<{code: string, battle: string} | null>(null);

  tallies(battleId: string): Observable<Tally[]> {
    return watch<Tally>(collection(db, 'battles', battleId, 'tally'));
  }

  // Three on or coming per kitchen that started them: the battle takes a free place in
  // battleSlots/{kid} in the same batch (the rules check the place's last battle has ended).
  async create(fields: BattleFields) {
    this.usage.act('battle');
    const kid = this.auth.currentKitchenId;
    const slotsRef = doc(db, 'battleSlots', kid);
    const slots = (await getDoc(slotsRef)).data() ?? {};
    let free: string | null = null;
    for (const slot of BATTLE_SLOTS) {
      const held = slots[slot];
      const battle = held ? await getDoc(doc(db, 'battles', held)) : null;
      if (!battle?.exists() || millis(battle.get('to')) <= Date.now()) {
        free = slot;
        break;
      }
    }
    if (!free) {
      throw new Error(TOO_MANY_BATTLES);
    }
    const ref = doc(collection(db, 'battles'));
    const batch = writeBatch(db);
    batch.set(ref, {...fields, kitchenId: kid, participants: [kid], createdAt: serverTimestamp()});
    batch.set(slotsRef, {[free]: ref.id}, {merge: true});
    return bump(batch, 'battles').commit();
  }

  join(battle: Battle) {
    this.usage.act('battle-join');
    const batch = writeBatch(db);
    batch.update(doc(db, 'battles', battle.id), {participants: arrayUnion(this.auth.currentKitchenId)});
    return bump(batch, 'battles').commit();
  }

  callOff(battle: Battle) {
    this.usage.act('battle-calloff');
    const batch = writeBatch(db);
    batch.delete(doc(db, 'battles', battle.id));
    return bump(batch, 'battles').commit();
  }

  // A sale (units > 0) or its undo (units < 0) at `at`.
  onSale(product: Pick<Product, 'category'>, units: number, at = Date.now()) {
    this.move(b => during(b, at) ? saleUnits(b.metric, product, units) : 0);
  }

  // A resident in (+1) or out (-1) of a dinner.
  onDiner(meal: Pick<Meal, 'date'>, n: number) {
    this.move(b => b.metric === 'mealDiners' && during(b, millis(meal.date)) ? n : 0);
  }

  // A dinner booked (+1), removed (-1), or re-tagged (0 with plantDelta), and its diners.
  onMeal(meal: Pick<Meal, 'date' | 'tags' | 'signups'>, direction: 1 | -1) {
    const at = millis(meal.date);
    this.move(b => b.metric === 'mealDiners' && during(b, at) ? direction * meal.signups.length : 0);
    this.move(b => b.metric === 'plantMeals' && during(b, at) ? direction * (isPlantMeal(meal.tags) ? 1 : 0) : 0,
      b => b.metric === 'plantMeals' && during(b, at) ? direction : 0);
  }

  onRetag(meal: Pick<Meal, 'date'>, wasPlant: boolean, isPlant: boolean) {
    if (wasPlant !== isPlant) {
      this.move(b => b.metric === 'plantMeals' && during(b, millis(meal.date)) ? (isPlant ? 1 : -1) : 0);
    }
  }

  // Someone back from the gym: one tap, one more.
  gym(battle: Battle, n: 1 | -1) {
    this.usage.act('gym');
    return this.write(battle, n, 0);
  }

  private move(value: (b: Battle) => number, total: (b: Battle) => number = () => 0) {
    let live: Battle[];
    try {
      live = this.myLive();
    } catch {
      return;
    }
    for (const b of live) {
      const v = value(b), t = total(b);
      if (v || t) {
        this.write(b, v, t).catch(() => undefined);
      }
    }
  }

  private async write(battle: Battle, value: number, total: number) {
    const kid = this.auth.currentKitchenId;
    const mine = this.myTallies().get(battle.id);
    const ticks = value ? addTick(mine?.ticks, value, Timestamp.now()) : mine?.ticks ?? [];
    await setDoc(doc(db, 'battles', battle.id, 'tally', kid), {
      value: increment(value), ...(battle.metric === 'plantMeals' ? {total: increment(total)} : {}),
      ticks, updatedAt: serverTimestamp(),
    }, {merge: true});
    this.claim(battle, (mine?.value ?? 0) + value);
  }

  // The rules check the tally, so a claim that is not earned yet simply fails.
  private claim(battle: Battle, value: number) {
    const kid = this.auth.currentKitchenId;
    for (const code of earnedAchievements(battle, {value}, this.myAchievements())) {
      setDoc(doc(db, 'standings', kid, 'achievements', code), {battle: battle.id, at: serverTimestamp()})
        .then(() => this.justEarned.set({code, battle: battle.id}), () => undefined);
    }
  }

  static metricIcon(metric: Metric): string {
    return {drinks: 'local_bar', beer: 'sports_bar', mealDiners: 'restaurant', plantMeals: 'eco', gym: 'fitness_center'}[metric];
  }
}
