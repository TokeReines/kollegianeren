import {Component, OnInit, ViewChild} from '@angular/core';
import {ProductService} from '../../services/product.service';
import {Observable} from 'rxjs';
import {Product} from '../../interfaces/product';
import {MatDialog, MatSort, MatTableDataSource} from '@angular/material';
import {EditProductDialogComponent} from './edit-product-dialog/edit-product-dialog.component';
import {AddProductDialogComponent} from './add-product-dialog/add-product-dialog.component';
import {map} from 'rxjs/operators';


@Component({
  selector: 'app-products',
  templateUrl: './products.component.html',
})
export class ProductsComponent implements OnInit {
  products: MatTableDataSource<Product>;
  @ViewChild(MatSort) sort: MatSort;
  displayedColumns = ['image', 'name', 'retailPrice', 'price', 'active', 'edit', 'delete'];

  constructor(private productService: ProductService, public dialog: MatDialog) {
  }

  ngOnInit() {
    this.productService.list().subscribe(data => {
      this.products =  new MatTableDataSource<Product>(data);
      this.products.sort = this.sort;
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
          this.products = new MatTableDataSource<Product>(data);
          this.products.sort = this.sort;
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
