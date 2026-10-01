import {Component, inject, signal} from '@angular/core';
import {NonNullableFormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {EditableProduct, PRODUCT_CATEGORIES, Product, ProductCategory} from '../../interfaces/product';
import {TranslatePipe} from '../../translate.pipe';
import {ImagePickerComponent} from '../shared/image-picker.component';

// Adding a new product (data null) or editing one. Closes with the edited fields, or nothing.
// Stock is not among them: it changes with every sale and has its own buttons.
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
          <input matInput type="number" inputmode="decimal" min="0" step="0.5" formControlName="price">
          <span matTextSuffix>kr.</span>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ "PRODUCTS_RETAIL_PRICE" | translate }}</mat-label>
          <input matInput type="number" inputmode="decimal" min="0" step="0.01" formControlName="retailPrice">
          <span matTextSuffix>kr.</span>
        </mat-form-field>
      </div>
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
  private readonly ref = inject<MatDialogRef<ProductDialogComponent, EditableProduct>>(MatDialogRef);
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.product?.name ?? '', [Validators.required, Validators.maxLength(60)]],
    price: [this.product?.price ?? (null as number | null), [Validators.required, Validators.min(0)]],
    retailPrice: [this.product?.retailPrice ?? (null as number | null), [Validators.min(0)]],
    active: [this.product?.active ?? true],
    category: [this.product?.category ?? (null as ProductCategory | null)],
  });
  protected readonly categories = PRODUCT_CATEGORIES;
  protected readonly image = signal(this.product?.image ?? '');
  protected readonly clId = signal(this.product?.clId ?? '');

  protected save() {
    if (this.form.invalid) {
      return;
    }
    const {name, price, retailPrice, active, category} = this.form.getRawValue();
    this.ref.close({
      name: name.trim(), price: Number(price), retailPrice: retailPrice === null ? null : Number(retailPrice),
      active, category, image: this.image(), clId: this.clId(),
    });
  }
}
