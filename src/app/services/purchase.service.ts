import {Injectable, inject} from '@angular/core';
import {DocumentReference, deleteDoc, doc, increment, limit, orderBy, query, serverTimestamp, where, writeBatch} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {Product, tracksStock} from '../interfaces/product';
import {Purchase} from '../interfaces/purchase';
import {User} from '../interfaces/user';
import {db} from '../firebase';
import {AuthService} from './auth.service';
import {kitchenCollection, watchInKitchen} from './kitchen-data';

export interface BasketLine {
  product: Product;
  amount: number;
}

// What a sale wrote, so it can be taken back.
export interface Sale {
  refs: DocumentReference[];
  // Units per product, for the stock and sold counters.
  units: {product: Product, units: number}[];
  // Resolves once the server has the purchases (only when the tablet is online).
  saved: Promise<void>;
}

@Injectable({providedIn: 'root'})
export class PurchaseService {
  private readonly auth = inject(AuthService);

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

  // Every buyer gets every line of the basket: one purchase per buyer and product.
  // The purchases go in one batch (queued while offline, like any write). The stock and sold
  // counters go in a second one: if that fails, for a product deleted meanwhile, the purchases
  // still count.
  sell(basket: BasketLine[], buyers: User[]): Sale {
    const batch = writeBatch(db);
    const refs: DocumentReference[] = [];
    for (const buyer of buyers) {
      for (const {product, amount} of basket) {
        const ref = doc(this.purchases());
        batch.set(ref, {
          productId: product.id, productName: product.name, amount, price: product.price * amount,
          userId: buyer.id, userName: buyer.name, userRoom: buyer.room, timestamp: serverTimestamp(),
        });
        refs.push(ref);
      }
    }
    const units = basket.map(({product, amount}) => ({product, units: amount * buyers.length}));
    this.moveCounters(units, -1).catch(() => undefined);
    return {refs, units, saved: batch.commit()};
  }

  // The undo on the buy screen (the rules allow it for a minute).
  async unsell(sale: Sale): Promise<void> {
    const batch = writeBatch(db);
    sale.refs.forEach(ref => batch.delete(ref));
    await batch.commit();
    await this.moveCounters(sale.units, 1).catch(() => undefined);
  }

  delete(purchase: Purchase) {
    return deleteDoc(doc(this.purchases(), purchase.id));
  }

  // direction -1 for a sale (stock down, sold up), 1 for its undo.
  private moveCounters(units: Sale['units'], direction: 1 | -1) {
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
