import {Injectable, inject} from '@angular/core';
import {deleteDoc, doc, increment, limit, orderBy, query, serverTimestamp, where, writeBatch} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {Product, tracksStock} from '../interfaces/product';
import {Purchase} from '../interfaces/purchase';
import {User} from '../interfaces/user';
import {db} from '../firebase';
import {AuthService} from './auth.service';
import {LeagueService} from './league.service';
import {kitchenCollection, watchInKitchen} from './kitchen-data';
import {millis} from '../time';

// Units per product, for the stock and sold counters.
type Units = {product: Pick<Product, 'id' | 'stock'>, units: number}[];

@Injectable({providedIn: 'root'})
export class PurchaseService {
  private readonly auth = inject(AuthService);
  private readonly league = inject(LeagueService);

  private purchases() {
    return kitchenCollection(this.auth.currentKitchenId, 'purchases');
  }

  // Purchases from the start of `from` to the end of `to`.
  between(from: Date, to: Date): Observable<Purchase[]> {
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
    return watchInKitchen<Purchase>(this.auth.kitchenId$, kid =>
      query(kitchenCollection(kid, 'purchases'), where('timestamp', '>=', start), where('timestamp', '<', end)));
  }

  newest(count = 30): Observable<Purchase[]> {
    return watchInKitchen<Purchase>(this.auth.kitchenId$, kid =>
      query(kitchenCollection(kid, 'purchases'), orderBy('timestamp', 'desc'), limit(count)));
  }

  // Every buyer gets `amount` of the product: one purchase each, in one batch (queued while
  // offline, like any write). The stock and sold counters go in a second one: if that fails, for
  // a product deleted meanwhile, the purchases still count. Resolves once the server has them.
  sell(product: Product, amount: number, buyers: User[]): Promise<void> {
    const batch = writeBatch(db);
    for (const buyer of buyers) {
      batch.set(doc(this.purchases()), {
        productId: product.id, productName: product.name, amount, price: product.price * amount,
        userId: buyer.id, userName: buyer.name, userRoom: buyer.room, timestamp: serverTimestamp(),
      });
    }
    this.moveCounters([{product, units: amount * buyers.length}], -1).catch(() => undefined);
    // Live battles the kitchen is in: its own, separate write (docs/kollegiet.md, Battles).
    this.league.onSale(product, amount * buyers.length);
    return batch.commit();
  }

  // Takes a purchase back (a wrong tap, or a correction by the treasurer), and gives its units
  // back to the stock and sold counters. Tablets may do this for a minute after buying.
  async remove(purchase: Purchase, product: Pick<Product, 'id' | 'stock' | 'category'> | undefined): Promise<void> {
    await deleteDoc(doc(this.purchases(), purchase.id));
    this.league.onSale(product ?? {category: null}, -(Number(purchase.amount) || 0), millis(purchase.timestamp));
    if (product) {
      await this.moveCounters([{product, units: Number(purchase.amount) || 0}], 1).catch(() => undefined);
    }
  }

  // direction -1 for a sale (stock down, sold up), 1 for taking it back.
  private moveCounters(units: Units, direction: 1 | -1) {
    const batch = writeBatch(db);
    for (const {product, units: n} of units) {
      batch.update(doc(kitchenCollection(this.auth.currentKitchenId, 'products'), product.id), {
        sold: increment(-direction * n),
        ...(tracksStock(product) ? {stock: increment(direction * n)} : {}),
      });
    }
    return batch.commit();
  }
}
