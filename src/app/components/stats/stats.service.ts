import {Injectable, inject} from '@angular/core';
import {getDocs, query, where} from 'firebase/firestore';
import {firstValueFrom} from 'rxjs';
import {Meal} from '../../interfaces/meal';
import {Purchase} from '../../interfaces/purchase';
import {AuthService} from '../../services/auth.service';
import {kitchenCollection} from '../../services/kitchen-data';
import {Stats, computeStats, periodStart} from './stats';
import {FoodData} from './food-stats';

// How long a result is reused before the purchases are read again.
const FRESH_MS = 15 * 60e3;

// Statistics are read once per period (not a live listener) and kept for a while, because every
// purchase in the period is a document read against the free plan's daily quota.
@Injectable({providedIn: 'root'})
export class StatsService {
  private readonly auth = inject(AuthService);
  private readonly cache = new Map<string, {at: number, stats: Promise<Stats>}>();
  private readonly foodCache = new Map<string, {at: number, stats: Promise<FoodData>}>();

  load(days: number): Promise<Stats> {
    return this.cached(this.cache, days, () => this.read(days));
  }

  // Food club: one read per meal in the period, a few hundred at most. The meals themselves are
  // kept, so the page can narrow them to one resident without another read.
  loadFood(days: number): Promise<FoodData> {
    return this.cached(this.foodCache, days, async () => {
      const kid = await firstValueFrom(this.auth.kitchenId$);
      const from = periodStart(days);
      const meals = await getDocs(query(kitchenCollection(kid, 'meals'), where('date', '>=', from), where('date', '<', new Date())));
      return {meals: meals.docs.map(d => d.data() as Meal), from, days};
    });
  }

  private cached<T>(cache: Map<string, {at: number, stats: Promise<T>}>, days: number, read: () => Promise<T>): Promise<T> {
    const key = `${this.auth.membership()?.kitchenId}:${days}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) {
      return hit.stats;
    }
    const stats = read();
    cache.set(key, {at: Date.now(), stats});
    stats.catch(() => cache.delete(key));
    return stats;
  }

  private async read(days: number): Promise<Stats> {
    const kid = await firstValueFrom(this.auth.kitchenId$);
    const from = periodStart(days);
    const [purchases, products] = await Promise.all([
      getDocs(query(kitchenCollection(kid, 'purchases'), where('timestamp', '>=', from))),
      getDocs(kitchenCollection(kid, 'products')),
    ]);
    const cost = new Map(products.docs.filter(d => d.get('retailPrice') != null).map(d => [d.id, Number(d.get('retailPrice'))]));
    return computeStats(purchases.docs.map(d => d.data() as Purchase), from, days, cost);
  }
}
