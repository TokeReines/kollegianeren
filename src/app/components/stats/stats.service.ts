import {Injectable, inject} from '@angular/core';
import {getDocs, query, where} from 'firebase/firestore';
import {firstValueFrom} from 'rxjs';
import {Purchase} from '../../interfaces/purchase';
import {AuthService} from '../../services/auth.service';
import {kitchenCollection} from '../../services/kitchen-data';
import {Stats, computeStats, periodStart} from './stats';

// How long a result is reused before the purchases are read again.
const FRESH_MS = 15 * 60e3;

// Statistics are read once per period (not a live listener) and kept for a while, because every
// purchase in the period is a document read against the free plan's daily quota.
@Injectable({providedIn: 'root'})
export class StatsService {
  private readonly auth = inject(AuthService);
  private readonly cache = new Map<string, {at: number, stats: Promise<Stats>}>();

  load(days: number): Promise<Stats> {
    const key = `${this.auth.membership()?.kitchenId}:${days}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) {
      return hit.stats;
    }
    const stats = this.read(days);
    this.cache.set(key, {at: Date.now(), stats});
    stats.catch(() => this.cache.delete(key));
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
