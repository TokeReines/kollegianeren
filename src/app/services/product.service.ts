import {Injectable, inject} from '@angular/core';
import {addDoc, deleteDoc, doc, increment, updateDoc} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {EditableProduct, Product, ProductFields} from '../interfaces/product';
import {AuthService} from './auth.service';
import {kitchenCollection, watchInKitchen} from './kitchen-data';

@Injectable({providedIn: 'root'})
export class ProductService {
  private readonly auth = inject(AuthService);

  private products() {
    return kitchenCollection(this.auth.currentKitchenId, 'products');
  }

  list(): Observable<Product[]> {
    return watchInKitchen<Product>(this.auth.kitchenId$, kid => kitchenCollection(kid, 'products'));
  }

  add(product: ProductFields) {
    return addDoc(this.products(), product);
  }

  // Only the given fields: writing the whole product back could undo sales made meanwhile.
  update(product: Product, fields: Partial<EditableProduct>) {
    return updateDoc(doc(this.products(), product.id), fields);
  }

  delete(product: Product) {
    return deleteDoc(doc(this.products(), product.id));
  }

  // Receiving stock. Sales move stock and the sold counter in PurchaseService.sell.
  adjustStock(productId: string, delta: number) {
    return updateDoc(doc(this.products(), productId), {stock: increment(delta)});
  }

  setStock(productId: string, stock: number | null) {
    return updateDoc(doc(this.products(), productId), {stock});
  }
}
