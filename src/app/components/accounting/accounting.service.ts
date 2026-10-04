import {Injectable, inject} from '@angular/core';
import {deleteField, doc, query, serverTimestamp, setDoc, updateDoc, where} from 'firebase/firestore';
import {Observable, combineLatest, defer, map, of, switchMap} from 'rxjs';
import {watch, watchDoc} from '../../firebase';
import {getDoc} from '../../read-meter';
import {Purchase} from '../../interfaces/purchase';
import {AuthService} from '../../services/auth.service';
import {kitchenCollection} from '../../services/kitchen-data';
import {PurchaseService} from '../../services/purchase.service';
import {UsageService} from '../../services/usage.service';
import {dayName} from '../stats/stats';
import {AccountsMonth, Bought, Removed, Settlement, fromSummary, monthsOf, settlementId} from './accounting';

// Regnskab's purchases for a period. Most of it comes from the nightly summary (ops/stats-summary.js),
// a read per month, and only the purchases after it are read, live, with the ones taken back since.
// Without a summary that covers the period, every purchase in it is a read, as before.
@Injectable({providedIn: 'root'})
export class AccountingService {
  private readonly auth = inject(AuthService);
  private readonly purchases = inject(PurchaseService);
  private readonly usage = inject(UsageService);

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

  // Who has paid for exactly this period: one document, live.
  settlement(from: Date, to: Date): Observable<Settlement | null> {
    return this.auth.kitchenId$.pipe(switchMap(kid => watchDoc<Settlement>(doc(kitchenCollection(kid, 'settlements'), settlementId(from, to)))));
  }

  // Ticked: what the resident owed when ticked, so a later change shows. Unticked: gone.
  setPaid(from: Date, to: Date, userId: string, kr: number | null) {
    this.usage.act('accounting-paid');
    const ref = doc(kitchenCollection(this.auth.currentKitchenId, 'settlements'), settlementId(from, to));
    return kr === null
      ? updateDoc(ref, {[`paid.${userId}`]: deleteField()})
      : setDoc(ref, {from: dayName(from), to: dayName(to), paid: {[userId]: {kr, at: serverTimestamp()}}}, {merge: true});
  }

  // The kitchen's MobilePay number for the messages to residents.
  readonly settings$: Observable<{mobilePay?: string} | null> = this.auth.kitchenId$.pipe(
    switchMap(kid => watchDoc<{mobilePay?: string}>(doc(kitchenCollection(kid, 'settings'), 'accounting'))));

  saveMobilePay(mobilePay: string) {
    return setDoc(doc(kitchenCollection(this.auth.currentKitchenId, 'settings'), 'accounting'), {mobilePay: mobilePay.trim()}, {merge: true});
  }
}
