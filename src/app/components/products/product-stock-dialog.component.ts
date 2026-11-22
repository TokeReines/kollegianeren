import {Component, computed, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {Product, tracksStock} from '../../interfaces/product';
import {Notify} from '../../services/notify.service';
import {ProductService} from '../../services/product.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {Confirm} from '../confirm-dialog/confirm-dialog.component';

// A product's stock, from its Lager button under Products: start tracking it, add what came in,
// or say how many there really are. Every button writes at once, and only the stock: it also
// moves with every sale, so it is never written back with the rest of the product.
@Component({
  selector: 'app-product-stock-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ "PRODUCTS_STOCK" | translate }}: {{ product.name }}</h2>
    <mat-dialog-content>
      @if (stock() === null) {
        <p class="state">{{ "PRODUCTS_STOCK_NOT_TRACKED" | translate }}</p>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ "PRODUCTS_STOCK_START" | translate }}</mat-label>
            <input matInput type="number" inputmode="numeric" min="0" cdkFocusInitial
                   [ngModel]="startInput()" (ngModelChange)="startInput.set($event)" (keydown.enter)="track()">
          </mat-form-field>
          <button mat-flat-button type="button" (click)="track()" [disabled]="!whole(startInput())">{{ "PRODUCTS_STOCK_TRACK" | translate }}</button>
        </div>
        <p class="rule">{{ "PRODUCTS_STOCK_RULE" | translate }}</p>
      } @else {
        <p class="state"><b>{{ stock() }}</b> {{ "PRODUCTS_SALES_LEFT" | translate }}</p>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ "PRODUCTS_STOCK_RECEIVE" | translate }}</mat-label>
            <input matInput type="number" inputmode="numeric" min="1" cdkFocusInitial
                   [ngModel]="receiveInput()" (ngModelChange)="receiveInput.set($event)" (keydown.enter)="receive()">
          </mat-form-field>
          <button mat-flat-button type="button" (click)="receive()" [disabled]="!whole(receiveInput(), 1)">{{ "PRODUCTS_STOCK_ADD" | translate }}</button>
        </div>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ "PRODUCTS_STOCK_NOW" | translate }}</mat-label>
            <input matInput type="number" inputmode="numeric" min="0"
                   [ngModel]="fixValue()" (ngModelChange)="fixInput.set($event)" (keydown.enter)="fix()">
          </mat-form-field>
          <button mat-stroked-button type="button" (click)="fix()" [disabled]="!whole(fixValue())">{{ "PRODUCTS_STOCK_FIX" | translate }}</button>
        </div>
        <p class="rule">{{ "PRODUCTS_STOCK_RULE" | translate }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      @if (stock() !== null) {
        <button mat-button type="button" class="stop" (click)="stopTracking()">{{ "PRODUCTS_STOCK_STOP_BTN" | translate }}</button>
      }
      <button mat-button mat-dialog-close type="button">{{ "CLOSE" | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .state { margin: 0 0 16px; font: var(--mat-sys-title-medium); }
    .state b { font-weight: 700; }
    .row { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .state + .row { margin-top: 8px; }
    .row mat-form-field { flex: 1; }
    .row button { height: 56px; min-width: 112px; }
    .rule { margin: 0; font: var(--mat-sys-body-small); color: var(--mat-sys-on-surface-variant); }
    mat-dialog-actions { justify-content: space-between; }
    .stop { color: var(--mat-sys-error); }
  `,
})
export class ProductStockDialogComponent {
  protected readonly product = inject<Product>(MAT_DIALOG_DATA);
  private readonly productService = inject(ProductService);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly i18n = inject(TranslateService);

  // The product as it is now, so the number follows sales and the buttons here.
  private readonly products = toSignal(this.productService.list(), {initialValue: []});
  private readonly live = computed(() => this.products().find(p => p.id === this.product.id) ?? this.product);
  protected readonly stock = computed(() => {
    const p = this.live();
    return tracksStock(p) ? p.stock : null;
  });

  // Empty: 0 would put it straight on sold out.
  protected readonly startInput = signal<number | null>(null);
  protected readonly receiveInput = signal<number | null>(null);
  // What was typed in "På lager nu" (null once cleared); until then (undefined) it shows the live stock.
  protected readonly fixInput = signal<number | null | undefined>(undefined);
  protected readonly fixValue = computed(() => this.fixInput() === undefined ? this.stock() : this.fixInput());

  // A whole number of at least `min`.
  protected whole(v: number | null | undefined, min = 0): boolean {
    return v != null && Number.isInteger(Number(v)) && Number(v) >= min;
  }

  protected track() {
    if (this.whole(this.startInput())) {
      this.productService.setStock(this.product.id, Number(this.startInput())).catch(this.notify.error);
    }
  }

  protected receive() {
    if (this.whole(this.receiveInput(), 1)) {
      this.productService.adjustStock(this.product.id, Number(this.receiveInput())).catch(this.notify.error);
      this.receiveInput.set(null);
      this.fixInput.set(undefined);
    }
  }

  protected fix() {
    const n = this.fixValue();
    if (this.whole(n)) {
      this.productService.setStock(this.product.id, Number(n)).catch(this.notify.error);
      this.fixInput.set(undefined);
    }
  }

  protected async stopTracking() {
    const t = (k: string) => this.i18n.t(k);
    if (await this.confirm.ask({title: `${t('PRODUCTS_STOCK_STOP')} ${this.product.name}?`, confirm: t('PRODUCTS_STOCK_STOP_OK')})) {
      this.productService.setStock(this.product.id, null).catch(this.notify.error);
    }
  }
}
