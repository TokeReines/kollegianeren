import {Component, OnInit, inject, input, signal} from '@angular/core';
import {DatePipe, DecimalPipe} from '@angular/common';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {Product} from '../../interfaces/product';
import {Purchase} from '../../interfaces/purchase';
import {Notify} from '../../services/notify.service';
import {PurchaseService} from '../../services/purchase.service';
import {TranslatePipe} from '../../translate.pipe';

// A product's sales: how many have gone in all (the product's own counter) and the latest
// purchases, read once when it opens.
@Component({
  selector: 'app-product-sales',
  imports: [DatePipe, DecimalPipe, MatProgressSpinnerModule, TranslatePipe],
  template: `
    <p class="summary"><span><b>{{ product().sold ?? 0 }}</b> {{ "PRODUCTS_SALES_TOTAL" | translate }}</span></p>
    @if (failed()) {
      <p class="none">{{ "PRODUCTS_SALES_ERROR" | translate }}</p>
    } @else if (purchases() === null) {
      <mat-spinner diameter="32" />
    } @else if (!purchases()?.length) {
      <p class="none">{{ "PRODUCTS_SALES_NONE" | translate }}</p>
    } @else {
      <table class="sales">
        <thead>
          <tr>
            <th>{{ "BEERSYSTEM_TIME" | translate }}</th>
            <th>{{ "BEERSYSTEM_PURCHASER" | translate }}</th>
            <th class="num">{{ "BEERSYSTEM_AMOUNT" | translate }}</th>
            <th class="num">{{ "BEERSYSTEM_PRICE" | translate }}</th>
          </tr>
        </thead>
        <tbody>
          @for (p of purchases(); track p.id) {
            <tr>
              <td class="time">{{ p.timestamp?.toDate() | date:'d/M HH:mm' }}</td>
              <td>{{ p.userName }}</td>
              <td class="num">{{ p.amount }}</td>
              <td class="num">{{ p.price | number:'1.0-2' }} kr.</td>
            </tr>
          }
        </tbody>
      </table>
      <p class="note">{{ "PRODUCTS_SALES_LATEST" | translate }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .summary { margin: 0 0 12px; font: var(--mat-sys-title-medium); }
    .summary b { font-weight: 700; }
    .none, .note { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-medium); }
    .note { margin: 12px 0 0; font: var(--mat-sys-body-small); }
    table.sales { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 12px 8px 0; text-align: left; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    th { font: var(--mat-sys-label-large); color: var(--mat-sys-on-surface-variant); }
    .num { text-align: right; }
    .time { white-space: nowrap; }
  `,
})
export class ProductSalesComponent implements OnInit {
  readonly product = input.required<Product>();
  private readonly purchaseService = inject(PurchaseService);
  private readonly notify = inject(Notify);
  // null while it loads.
  protected readonly purchases = signal<Purchase[] | null>(null);
  protected readonly failed = signal(false);

  // Read once, for the product it was opened on.
  ngOnInit() {
    this.purchaseService.ofProduct(this.product().id).then(
      list => this.purchases.set(list),
      e => {
        this.failed.set(true);
        this.notify.error(e);
      });
  }
}

// From the number under "Solgt" on Products.
@Component({
  selector: 'app-product-sales-dialog',
  imports: [MatDialogModule, MatButtonModule, TranslatePipe, ProductSalesComponent],
  template: `
    <h2 mat-dialog-title>{{ "PRODUCTS_SALES_TITLE" | translate }}: {{ product.name }}</h2>
    <mat-dialog-content><app-product-sales [product]="product" /></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ "CLOSE" | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class ProductSalesDialogComponent {
  protected readonly product = inject<Product>(MAT_DIALOG_DATA);
}
