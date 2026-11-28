import {Injectable, inject} from '@angular/core';
import {addDoc, deleteDoc, doc, getDoc, increment, query, updateDoc, where} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {EditableProduct, Product, ProductFields} from '../interfaces/product';
import {AuthService} from './auth.service';
import {kitchenCollection, watchInKitchen} from './kitchen-data';
import {UsageService} from './usage.service';

@Injectable({providedIn: 'root'})
export class ProductService {
  private readonly usage = inject(UsageService);
  private readonly auth = inject(AuthService);

  private products() {
    return kitchenCollection(this.auth.currentKitchenId, 'products');
  }

  list(): Observable<Product[]> {
    return watchInKitchen<Product>(this.auth.kitchenId$, kid => kitchenCollection(kid, 'products'));
  }

  // Only what the buy page shows. Most kitchens keep more inactive products than active ones (Ny8: 43
  // of 52), and a tablet reads the whole list again each time it wakes after half an hour away.
  listActive(): Observable<Product[]> {
    return watchInKitchen<Product>(this.auth.kitchenId$, kid => query(kitchenCollection(kid, 'products'), where('active', '==', true)));
  }

  // One product, also an inactive one; undefined when it is gone.
  async get(id: string): Promise<Product | undefined> {
    const snap = await getDoc(doc(this.products(), id));
    return snap.exists() ? {...snap.data(), id: snap.id} as Product : undefined;
  }

  add(product: ProductFields) {
    this.usage.act('product-add');
    return addDoc(this.products(), product);
  }

  // Only the given fields: writing the whole product back could undo sales made meanwhile.
  update(product: Product, fields: Partial<EditableProduct>) {
    this.usage.act('product-edit');
    return updateDoc(doc(this.products(), product.id), fields);
  }

  delete(product: Product) {
    this.usage.act('product-delete');
    return deleteDoc(doc(this.products(), product.id));
  }

  // Receiving stock. Sales move stock and the sold counter in PurchaseService.sell.
  adjustStock(productId: string, delta: number) {
    this.usage.act('stock');
    return updateDoc(doc(this.products(), productId), {stock: increment(delta)});
  }

  setStock(productId: string, stock: number | null) {
    this.usage.act('stock');
    return updateDoc(doc(this.products(), productId), {stock});
  }
}
