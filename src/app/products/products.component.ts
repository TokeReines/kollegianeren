import {Component, OnInit} from '@angular/core';
import {ProductService} from '../core/services/product.service';
import {Observable} from 'rxjs';
import {Product} from '../core/interfaces/product';
import {MatDialog} from '@angular/material';
import {EditProductDialogComponent} from './edit-product-dialog/edit-product-dialog.component';
import {AddProductDialogComponent} from './add-product-dialog/add-product-dialog.component';
import {map} from 'rxjs/operators';


@Component({
  selector: 'app-products',
  templateUrl: './products.component.html',
})
export class ProductsComponent implements OnInit {
  products: Product[];
  displayedColumns = ['image', 'name', 'retailPrice', 'price', 'active', 'edit', 'delete'];

  constructor(private productService: ProductService, public dialog: MatDialog) {
  }

  ngOnInit() {
    this.productService.list().subscribe(data => {
      this.products = data;
    });
  }

  openEditDialog(product) {
    console.log(product);
    const dialogRef = this.dialog.open(EditProductDialogComponent, {
      width: '400px',
      height: '600px',
      data: product
    });

    dialogRef.afterClosed().subscribe(editedProduct => {
      if (!editedProduct) {
        this.productService.list().subscribe(data => {
          this.products = data;
        });
      } else {
        this.productService.update(editedProduct);
      }
    });
  }

  openAddDialog() {
    const dialogRef = this.dialog.open(AddProductDialogComponent, {
      width: '400px',
      height: '600px',
      data: {}
    });

    dialogRef.afterClosed().subscribe(newProduct => {
      if (newProduct) {
        this.productService.add(newProduct);
      }
    });
  }

}
