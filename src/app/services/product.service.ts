import {Injectable} from '@angular/core';
import {addDoc, collection, deleteDoc, doc, updateDoc} from 'firebase/firestore';
import {switchMap} from 'rxjs/operators';
import {Product} from '../interfaces/product';
import {AuthService} from './auth.service';
import {db, watch} from '../firebase';

@Injectable({
  providedIn: 'root'
})
export class ProductService {

  constructor(private auth: AuthService) {
  }

  private products(uid = this.auth.currentKitchenId) {
    return collection(db, 'kitchens', uid, 'products');
  }

  list() {
    return this.auth.kitchenId.pipe(switchMap(uid => watch<Product>(this.products(uid))));
  }

  update(product: Product) {
    return updateDoc(doc(this.products(), product.id), {...product});
  }

  delete(product: Product) {
    return deleteDoc(doc(this.products(), product.id));
  }

  add(product) {
    return addDoc(this.products(), product);
  }
}
