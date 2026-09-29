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
import {Confirm} from '../confirm-dialog/confirm-dialog.component';


@Component({
    selector: 'app-products',
    templateUrl: './products.component.html',
    styleUrls: ['./products.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ProductsComponent implements OnInit {
  products = new MatTableDataSource<Product>([]);
  @ViewChild(MatSort, { static: true }) sort: MatSort;
  displayedColumns = ['image', 'name', 'retailPrice', 'price', 'margin', 'stock', 'active', 'edit', 'delete'];
  lowStock: Product[] = [];
  lowStockText = '';
  margin = margin;
  tracksStock = tracksStock;
  isLowStock = isLowStock;

  constructor(public productService: ProductService, public dialog: MatDialog, private snackBar: MatSnackBar,
              private translate: TranslateService, private confirm: Confirm) {
  }

  ngOnInit() {
    this.products.sort = this.sort;
    this.productService.list().subscribe(data => {
      this.products.data = data;
      this.lowStock = data.filter(p => p.active && isLowStock(p));
      this.lowStockText = this.lowStock
        .map(p => `${p.name} (${p.stock > 0 ? p.stock : this.t('PRODUCTS_SOLD_OUT')})`).join(', ');
    });
  }

  openEditDialog(product) {
    // The dialog edits a copy, so cancelling leaves the row untouched.
    const dialogRef = this.dialog.open(EditProductDialogComponent, {
      width: '400px',
      height: '600px',
      data: {...product}
    });

    dialogRef.afterClosed().subscribe(editedProduct => {
      if (editedProduct) {
        this.productService.update(editedProduct).catch(this.fail);
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

  async trackStock(product: Product) {
    const n = await this.confirm.ask({
      title: `${this.t('PRODUCTS_STOCK_TRACK')}: ${product.name}`, confirm: this.t('PRODUCTS_STOCK_TRACK'),
      number: {label: this.t('PRODUCTS_STOCK_START'), value: 0, min: 0},
    });
    if (n !== undefined) {
      this.productService.setStock(product.id, n).catch(this.fail);
    }
  }

  async receive(product: Product) {
    const n = await this.confirm.ask({
      title: `${this.t('PRODUCTS_RECEIVE_TITLE')}: ${product.name}`, message: this.t('PRODUCTS_RECEIVE_HINT'),
      confirm: this.t('SAVE'), number: {label: this.t('PRODUCTS_STOCK_RECEIVE'), value: 24},
    });
    if (n) {
      this.productService.adjustStock(product.id, n).catch(this.fail);
    }
  }

  async stopTracking(product: Product) {
    const ok = await this.confirm.ask({title: `${this.t('PRODUCTS_STOCK_STOP')} ${product.name}?`, confirm: this.t('PRODUCTS_STOCK_STOP_OK')});
    if (ok) {
      this.productService.setStock(product.id, null).catch(this.fail);
    }
  }

  async remove(product: Product) {
    const ok = await this.confirm.ask({
      title: `${this.t('DELETE')} ${product.name}?`, message: this.t('PRODUCTS_DELETE_CONFIRM'), confirm: this.t('DELETE'), danger: true,
    });
    if (ok) {
      this.productService.delete(product).catch(this.fail);
    }
  }
}
