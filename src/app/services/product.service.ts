import {Injectable, OnInit} from '@angular/core';
import {AngularFirestore, AngularFirestoreCollection, AngularFirestoreDocument } from '@angular/fire/compat/firestore';
import {Product} from '../interfaces/product';
import {AuthService} from './auth.service';
import {map} from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  _products!: AngularFirestoreCollection<Product>;

  constructor(private afs: AngularFirestore, private auth: AuthService) {
    this.auth.user.pipe().subscribe(
      (user) => {
        if (!user) {
          return;
        }
        this._products = this.afs.collection<Product>('kitchens').doc(user.uid).collection('products');
      }
    );
  }

  list(): Observable<Product[]> {
    let products: AngularFirestoreDocument<Product>[];
    this.auth.user.pipe().subscribe(
      (user) => {
        if (!user) {
          return;
        }
        this.afs.collection<Product>('kitchens').doc(user.uid).collection('products').snapshotChanges()
        .pipe(
          map(actions => actions.map(a => {
            const data = a.payload.doc.data() as Product;
            const id = a.payload.doc.id;
            let p = {...data, id} as Product;
            products.add
          }))
        );
      }
    )
    products.snapshotChanges()
      .pipe(
        map(actions => actions.map(a => {
          const data = a.payload.doc.data() as Product;
          const id = a.payload.doc.id;
          return {...data, id} as Product;
        }))
      );
  }

  update(product: Product) {
    this._products.doc(product.id).update(product);
  }

  delete(product: Product) {
    this._products.doc(product.id).delete();
  }

  add(product: Product) {
    this._products.add(product);
  }
}
