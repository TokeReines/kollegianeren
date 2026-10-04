import {Injectable, inject} from '@angular/core';
import {doc, query, where} from 'firebase/firestore';
import {Observable, combineLatest, defer, map, of, switchMap} from 'rxjs';
import {watch} from '../../firebase';
import {getDoc} from '../../read-meter';
import {Purchase} from '../../interfaces/purchase';
import {AuthService} from '../../services/auth.service';
import {kitchenCollection} from '../../services/kitchen-data';
import {PurchaseService} from '../../services/purchase.service';
import {dayName} from '../stats/stats';
import {AccountsMonth, Bought, Removed, fromSummary, monthsOf} from './accounting';

// Regnskab's purchases for a period. Most of it comes from the nightly summary (ops/stats-summary.js),
// a read per month, and only the purchases after it are read, live, with the ones taken back since.
// Without a summary that covers the period, every purchase in it is a read, as before.
@Injectable({providedIn: 'root'})
export class AccountingService {
  private readonly auth = inject(AuthService);
  private readonly purchases = inject(PurchaseService);

  between(from: Date, to: Date): Observable<Bought[]> {
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
    return this.auth.kitchenId$.pipe(switchMap(kid => defer(() => this.summary(kid, from, to)).pipe(switchMap(months => {
      if (!months) {
        return this.purchases.between(from, to);
      }
      const {through, removedThrough} = months[0];
      const purchases = kitchenCollection(kid, 'purchases');
      const after = through.toMillis() >= end.getTime() ? of([]) : watch<Purchase>(query(purchases,
        through.toMillis() >= start.getTime() ? where('timestamp', '>', through) : where('timestamp', '>=', start), where('timestamp', '<', end)));
      const removed = watch<Removed>(query(kitchenCollection(kid, 'removed'), where('removedAt', '>', removedThrough)));
      return combineLatest([after, removed]).pipe(map(([a, r]) => fromSummary(months, from, to, a, r)));
    }))));
  }

  // The months of the period up to now, if the summary has them all, from the same night, and
  // complete from the period's first day.
  private async summary(kid: string, from: Date, to: Date): Promise<AccountsMonth[] | null> {
    const now = new Date();
    try {
      const docs = await Promise.all(monthsOf(from, to > now ? now : to).map(m => getDoc(doc(kitchenCollection(kid, 'summaries'), `accounts-${m}`))));
      if (!docs.length || docs.some(d => !d.exists())) {
        return null;
      }
      const months = docs.map(d => d.data() as AccountsMonth);
      const {through, removedThrough} = months[0];
      const whole = months.every(m => m.through.isEqual(through) && m.removedThrough.isEqual(removedThrough) && m.since <= dayName(from));
      return whole ? months : null;
    } catch {
      return null;
    }
  }
}
