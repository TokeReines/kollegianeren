import {Component, inject, signal} from '@angular/core';
import {NonNullableFormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {EditableProduct, NewProduct, PRODUCT_CATEGORIES, Product, ProductCategory} from '../../interfaces/product';
import {TranslatePipe} from '../../translate.pipe';
import {AMOUNT_PATTERN, krInput, parseKr} from '../../format';
import {notBlank} from '../../validators';
import {ImagePickerComponent} from '../shared/image-picker.component';

// Adding a new product (data null) or editing one. Closes with the edited fields, or nothing.
// Stock is not among them when editing: it changes with every sale and has its own dialog. A new
// product may start with it.
@Component({
  selector: 'app-product-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    TranslatePipe, ImagePickerComponent],
  template: `
    <h2 mat-dialog-title>{{ (product ? "PRODUCTS_EDIT_PRODUCT" : "PRODUCTS_NEW") | translate }}</h2>
    <form mat-dialog-content [formGroup]="form" (ngSubmit)="save()" id="product-form">
      <mat-form-field>
        <mat-label>{{ "NAME" | translate }}</mat-label>
        <input matInput formControlName="name" maxlength="60" cdkFocusInitial>
      </mat-form-field>
      <div class="prices">
        <mat-form-field>
          <mat-label>{{ "PRODUCTS_SALES_PRICE" | translate }}</mat-label>
          <input matInput inputmode="decimal" formControlName="price" autocomplete="off">
          <span matTextSuffix>kr.</span>
          <mat-error>{{ "AMOUNT_INVALID" | translate }}</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ "PRODUCTS_RETAIL_PRICE" | translate }}</mat-label>
          <input matInput inputmode="decimal" formControlName="retailPrice" autocomplete="off">
          <span matTextSuffix>kr.</span>
          <mat-error>{{ "AMOUNT_INVALID" | translate }}</mat-error>
        </mat-form-field>
      </div>
      @if (!product) {
        <mat-form-field>
          <mat-label>{{ "PRODUCTS_STOCK_INITIAL" | translate }}</mat-label>
          <input matInput type="number" inputmode="numeric" min="0" step="1" formControlName="stock">
          <mat-hint>{{ "PRODUCTS_STOCK_INITIAL_HINT" | translate }}</mat-hint>
          <mat-error>{{ "PRODUCTS_STOCK_WHOLE" | translate }}</mat-error>
        </mat-form-field>
      }
      <mat-form-field>
        <mat-label>{{ "PRODUCTS_CATEGORY" | translate }}</mat-label>
        <mat-select formControlName="category">
          <mat-option [value]="null">{{ "PRODUCTS_CATEGORY_NONE" | translate }}</mat-option>
          @for (c of categories; track c) {
            <mat-option [value]="c">{{ "CATEGORY_" + c | translate }}</mat-option>
          }
        </mat-select>
        <mat-hint>{{ "PRODUCTS_CATEGORY_HINT" | translate }}</mat-hint>
      </mat-form-field>
      <app-image-picker [(image)]="image" [(clId)]="clId" />
      <mat-checkbox formControlName="active">{{ "PRODUCTS_FRIDGE" | translate }}</mat-checkbox>
    </form>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">{{ "CANCEL" | translate }}</button>
      <button mat-flat-button type="submit" form="product-form" [disabled]="form.invalid">{{ "SAVE" | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    form { display: flex; flex-direction: column; gap: 12px; }
    .prices { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  `,
})
export class ProductDialogComponent {
  protected readonly product = inject<Product | null>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ProductDialogComponent, EditableProduct | NewProduct>>(MatDialogRef);
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.product?.name ?? '', [Validators.required, notBlank, Validators.maxLength(60)]],
    price: [krInput(this.product?.price), [Validators.required, Validators.pattern(AMOUNT_PATTERN)]],
    retailPrice: [krInput(this.product?.retailPrice), [Validators.pattern(AMOUNT_PATTERN)]],
    active: [this.product?.active ?? true],
    category: [this.product?.category ?? (null as ProductCategory | null)],
    // Only for a new product; empty means stock is not tracked.
    stock: [null as number | null, [Validators.min(0), Validators.pattern(/^\d*$/)]],
  });
  protected readonly categories = PRODUCT_CATEGORIES;
  protected readonly image = signal(this.product?.image ?? '');
  protected readonly clId = signal(this.product?.clId ?? '');

  protected save() {
    if (this.form.invalid) {
      return;
    }
    const {name, price, retailPrice, active, category, stock} = this.form.getRawValue();
    const fields: EditableProduct = {
      name: name.trim(), price: parseKr(price) ?? 0, retailPrice: parseKr(retailPrice),
      active, category, image: this.image(), clId: this.clId(),
    };
    this.ref.close(!this.product && stock !== null && String(stock) !== '' ? {...fields, stock: Number(stock)} : fields);
  }
}
