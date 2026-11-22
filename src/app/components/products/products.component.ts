import {Component, computed, effect, inject, viewChild} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatTooltipModule} from '@angular/material/tooltip';
import {DecimalPipe} from '@angular/common';
import {EditableProduct, NewProduct, Product, isLowStock, lacksBeer, margin, tracksStock} from '../../interfaces/product';
import {ProductService} from '../../services/product.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {Confirm} from '../confirm-dialog/confirm-dialog.component';
import {ProductPictureComponent} from '../shared/product-picture.component';
import {ProductDialogComponent} from './product-dialog.component';
import {ProductSalesDialogComponent} from './product-sales.component';
import {ProductStockDialogComponent} from './product-stock-dialog.component';
import {sortValue} from '../../table-sort';

@Component({
  selector: 'app-products',
  imports: [DecimalPipe, MatButtonModule, MatCheckboxModule, MatIconModule, MatSortModule, MatTableModule, MatTooltipModule,
    TranslatePipe, ProductPictureComponent],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss',
})
export class ProductsComponent {
  private readonly productService = inject(ProductService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(TranslateService);
  private readonly confirm = inject(Confirm);

  private readonly products = toSignal(this.productService.list(), {initialValue: []});
  private readonly sort = viewChild.required(MatSort);
  protected readonly table = new MatTableDataSource<Product>([]);
  protected readonly displayedColumns = ['image', 'name', 'retailPrice', 'price', 'margin', 'sold', 'stock', 'active', 'edit', 'delete'];
  protected readonly lacksBeer = computed(() => lacksBeer(this.products()));
  protected readonly lowStock = computed(() => this.products().filter(p => p.active && isLowStock(p)));
  protected readonly lowStockText = computed(() => this.lowStock()
    .map(p => `${p.name} (${(p.stock ?? 0) > 0 ? p.stock : this.i18n.t('PRODUCTS_SOLD_OUT')})`).join(', '));
  protected readonly margin = margin;
  protected readonly tracksStock = tracksStock;
  protected readonly isLowStock = isLowStock;

  constructor() {
    this.table.sortingDataAccessor = (p, column) => column === 'margin' ? margin(p) ?? 0 : sortValue(p[column as keyof Product]);
    effect(() => this.table.sort = this.sort());
    effect(() => this.table.data = this.products());
  }

  protected edit(product: Product | null = null) {
    this.dialog.open<ProductDialogComponent, Product | null, EditableProduct | NewProduct>(ProductDialogComponent,
      {width: '440px', maxWidth: '94vw', data: product})
      .afterClosed().subscribe(fields => {
        if (fields) {
          (product ? this.productService.update(product, fields) : this.productService.add(fields)).catch(this.notify.error);
        }
      });
  }

  protected showStock(product: Product) {
    this.dialog.open(ProductStockDialogComponent, {width: '460px', maxWidth: '94vw', data: product});
  }

  protected showSales(product: Product) {
    this.dialog.open(ProductSalesDialogComponent, {width: '520px', maxWidth: '94vw', data: product});
  }

  protected setActive(product: Product, active: boolean) {
    this.productService.update(product, {active}).catch(this.notify.error);
  }

  async remove(product: Product) {
    const t = (k: string) => this.i18n.t(k);
    if (await this.confirm.ask({title: `${t('DELETE')} ${product.name}?`, message: t('PRODUCTS_DELETE_CONFIRM'), confirm: t('DELETE'), danger: true})) {
      this.productService.delete(product).catch(this.notify.error);
    }
  }
}
