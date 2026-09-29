import {Component, OnInit, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {ProductService} from '../../services/product.service';
import {Observable} from 'rxjs';
import {Product} from '../../interfaces/product';
import { MatDialog } from '@angular/material/dialog';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import {EditProductDialogComponent} from './edit-product-dialog/edit-product-dialog.component';
import {AddProductDialogComponent} from './add-product-dialog/add-product-dialog.component';
import {map} from 'rxjs/operators';
import {MatSnackBar} from '@angular/material/snack-bar';
import {isLowStock, margin, tracksStock} from '../../interfaces/product';
import {TranslateService} from '../../services/translate.service';


@Component({
    selector: 'app-products',
    templateUrl: './products.component.html',
    styleUrls: ['./products.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ProductsComponent implements OnInit {
  products: MatTableDataSource<Product>;
  @ViewChild(MatSort, { static: true }) sort: MatSort;
  displayedColumns = ['image', 'name', 'retailPrice', 'price', 'margin', 'stock', 'active', 'edit', 'delete'];
  lowStock: Product[] = [];
  margin = margin;
  tracksStock = tracksStock;
  isLowStock = isLowStock;

  constructor(public productService: ProductService, public dialog: MatDialog, private snackBar: MatSnackBar,
              private translate: TranslateService) {
  }

  ngOnInit() {
    this.productService.list().subscribe(data => {
      this.products =  new MatTableDataSource<Product>(data);
      this.products.sort = this.sort;
      this.lowStock = data.filter(p => p.active && isLowStock(p));
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


  private t(key: string) {
    return this.translate.data[key] || key;
  }

  private fail = (e: Error) => this.snackBar.open(e.message, 'OK', {duration: 6000});

  trackStock(product: Product) {
    const n = Number(prompt(this.t('PRODUCTS_STOCK_START'), '0'));
    if (isFinite(n) && n >= 0) {
      this.productService.setStock(product.id, Math.round(n)).catch(this.fail);
    }
  }

  receive(product: Product) {
    const n = Number(prompt(`${this.t('PRODUCTS_STOCK_RECEIVE')} ${product.name}`, '24'));
    if (isFinite(n) && n !== 0) {
      this.productService.adjustStock(product.id, Math.round(n)).catch(this.fail);
    }
  }

  stopTracking(product: Product) {
    if (confirm(`${this.t('PRODUCTS_STOCK_STOP')} ${product.name}?`)) {
      this.productService.setStock(product.id, null).catch(this.fail);
    }
  }
}
