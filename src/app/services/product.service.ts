import {Injectable, OnInit} from '@angular/core';
import {AngularFirestore, AngularFirestoreCollection} from '@angular/fire/firestore';
import {Product} from '../interfaces/product';
import {AuthService} from './auth.service';
import {map} from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  _products: AngularFirestoreCollection<Product>;

  constructor(private afs: AngularFirestore, private auth: AuthService) {
    this.auth.user.pipe().subscribe(
      (user) => {
        if (!user) {
          console.log(user);
          return;
        }
        this._products = this.afs.collection<Product>('kitchens').doc(user.uid).collection('products');
      }
    );
  }

  list() {
    return this._products.snapshotChanges()
      .pipe(
        map(actions => actions.map(a => {
          const data = a.payload.doc.data() as Product;
          const id = a.payload.doc.id;
          return {id, ...data} as Product;
        }))
      );
  }

  update(product: Product) {
    this._products.doc(product.id).update(product);
  }

  delete(product: Product) {
    this._products.doc(product.id).delete();
  }

  add(product) {
    this._products.add(product);
  }
}
