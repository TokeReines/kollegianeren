import {Injectable, inject} from '@angular/core';
import {doc, increment, limit, orderBy, query, serverTimestamp, where, writeBatch} from 'firebase/firestore';
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

// Units per product, for the stock and sold counters.
type Units = {product: Pick<Product, 'id' | 'stock'>, units: number}[];

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

  // Every buyer gets every line of the basket: one purchase per buyer and product, sharing a
  // saleId so the basket can be taken back as one. The purchases go in one batch (queued while
  // offline, like any write). The stock and sold counters go in a second one: if that fails, for
  // a product deleted meanwhile, the purchases still count. Resolves once the server has them.
  sell(basket: BasketLine[], buyers: User[]): Promise<void> {
    const batch = writeBatch(db);
    const saleId = doc(this.purchases()).id;
    for (const buyer of buyers) {
      for (const {product, amount} of basket) {
        batch.set(doc(this.purchases()), {
          productId: product.id, productName: product.name, amount, price: product.price * amount,
          userId: buyer.id, userName: buyer.name, userRoom: buyer.room, timestamp: serverTimestamp(), saleId,
        });
      }
    }
    this.moveCounters(basket.map(({product, amount}) => ({product, units: amount * buyers.length})), -1).catch(() => undefined);
    return batch.commit();
  }

  // Takes purchases back (a wrong tap, or a correction by the treasurer), and gives their units
  // back to the stock and sold counters. Tablets may do this for a minute after buying.
  async remove(purchases: Purchase[], products: Pick<Product, 'id' | 'stock'>[]): Promise<void> {
    const batch = writeBatch(db);
    purchases.forEach(p => batch.delete(doc(this.purchases(), p.id)));
    await batch.commit();
    const byId = new Map(products.map(p => [p.id, p]));
    const units = new Map<string, number>();
    purchases.forEach(p => units.set(p.productId, (units.get(p.productId) ?? 0) + (Number(p.amount) || 0)));
    const counters = [...units].map(([id, n]) => ({product: byId.get(id), units: n}))
      .filter((u): u is Units[number] => !!u.product);
    await this.moveCounters(counters, 1).catch(() => undefined);
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
