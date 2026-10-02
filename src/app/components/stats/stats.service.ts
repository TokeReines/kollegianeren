import {Injectable, inject} from '@angular/core';
import {doc, getDoc, getDocs, query, where} from 'firebase/firestore';
import {firstValueFrom} from 'rxjs';
import {Meal} from '../../interfaces/meal';
import {Purchase} from '../../interfaces/purchase';
import {AuthService} from '../../services/auth.service';
import {kitchenCollection} from '../../services/kitchen-data';
import {Stats, StatsSummary, computeStats, computeStatsFrom, dayName, periodStart} from './stats';
import {FoodStats, computeFoodStats} from './food-stats';

// How long a result is reused before the purchases are read again.
const FRESH_MS = 15 * 60e3;

// Statistics are read once per period (not a live listener) and kept for a while. Most of a period
// comes from the nightly summary (ops/stats-summary.js), one read, and only the purchases since it
// are read; without a summary, every purchase in the period is a read against the daily quota.
@Injectable({providedIn: 'root'})
export class StatsService {
  private readonly auth = inject(AuthService);
  private readonly cache = new Map<string, {at: number, stats: Promise<Stats>}>();
  private readonly foodCache = new Map<string, {at: number, stats: Promise<FoodStats>}>();

  load(days: number): Promise<Stats> {
    return this.cached(this.cache, days, () => this.read(days));
  }

  // Food club: one read per meal in the period, a few hundred at most.
  loadFood(days: number): Promise<FoodStats> {
    return this.cached(this.foodCache, days, async () => {
      const kid = await firstValueFrom(this.auth.kitchenId$);
      const from = periodStart(days);
      const meals = await getDocs(query(kitchenCollection(kid, 'meals'), where('date', '>=', from), where('date', '<', new Date())));
      return computeFoodStats(meals.docs.map(d => d.data() as Meal), from, days);
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

  // From the nightly summary (1 read) and the purchases since it, when it covers the period;
  // otherwise every purchase in the period, as before.
  private async read(days: number): Promise<Stats> {
    const kid = await firstValueFrom(this.auth.kitchenId$);
    const from = periodStart(days);
    const purchases = kitchenCollection(kid, 'purchases');
    const [summary, products] = await Promise.all([
      getDoc(doc(kitchenCollection(kid, 'summaries'), 'stats')).then(d => d.exists() ? d.data() as StatsSummary : null, () => null),
      getDocs(kitchenCollection(kid, 'products')),
    ]);
    const cost = new Map(products.docs.filter(d => d.get('retailPrice') != null).map(d => [d.id, Number(d.get('retailPrice'))]));
    if (summary && summary.since <= dayName(from)) {
      const since = summary.through.toMillis() > from.getTime() ? where('timestamp', '>', summary.through) : where('timestamp', '>=', from);
      const after = await getDocs(query(purchases, since));
      return computeStatsFrom(summary, after.docs.map(d => d.data() as Purchase), from, days, cost);
    }
    const all = await getDocs(query(purchases, where('timestamp', '>=', from)));
    return computeStats(all.docs.map(d => d.data() as Purchase), from, days, cost);
  }
}
