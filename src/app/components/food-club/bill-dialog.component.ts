import {Component, computed, inject, signal} from '@angular/core';
import {DecimalPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {User} from '../../interfaces/user';
import {TranslatePipe} from '../../translate.pipe';

export interface BillDialogData {
  title: string;
  // Who ate (the sign-ups), and who may have paid: the cooks first, then the eaters.
  eaters: User[];
  payers: User[];
}

export interface BillResult {
  total: number;
  paidBy: string;
}

// Splitting a dinner's shopping: what it cost and who paid. Everyone who ate pays an equal share,
// and who paid gets it back, all in Regnskab (MealService.splitBill).
@Component({
  selector: 'app-bill-dialog',
  imports: [DecimalPipe, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ "FOOD_BILL_TITLE" | translate }}: {{ data.title }}</h2>
    <div mat-dialog-content class="content">
      <p>{{ data.eaters.length }} {{ "FOOD_BILL_HOW" | translate }}</p>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ "FOOD_BILL_TOTAL" | translate }}</mat-label>
        <input matInput type="number" inputmode="decimal" min="1" max="20000" step="0.01" [ngModel]="total() || null" (ngModelChange)="total.set(+$event)" autocomplete="off">
        <span matTextSuffix>kr.</span>
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ "FOOD_BILL_PAID_BY" | translate }}</mat-label>
        <mat-select [ngModel]="paidBy()" (ngModelChange)="paidBy.set($event)">
          @for (u of data.payers; track u.id) {
            <mat-option [value]="u.id">{{ u.name }}@if (u.room) { ({{ u.room }}) }</mat-option>
          }
        </mat-select>
      </mat-form-field>
      @if (valid()) {
        <p class="preview">
          {{ share() | number:'1.2-2' }} kr. {{ "FOOD_BILL_EACH" | translate }}.
          {{ payerName() }} {{ "FOOD_BILL_GETS_BACK" | translate }} {{ back() | number:'1.2-2' }} kr.
        </p>
      }
    </div>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">{{ "CANCEL" | translate }}</button>
      <button mat-flat-button [disabled]="!valid()" [mat-dialog-close]="result()">{{ "FOOD_BILL_SPLIT" | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; gap: 12px; }
    .content > mat-form-field:first-of-type { margin-top: 4px; }
    p { margin: 0; }
    .preview { padding: 8px 12px; border-radius: 12px; background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); }
  `,
})
export class BillDialogComponent {
  protected readonly data = inject<BillDialogData>(MAT_DIALOG_DATA);
  protected readonly total = signal(0);
  protected readonly paidBy = signal(this.data.payers[0]?.id ?? '');

  protected readonly valid = computed(() => this.data.eaters.length > 0 && this.total() > 0 && this.total() <= 20000 && !!this.paidBy());
  // The share before rounding to øre; the first eaters pay an øre more when it does not divide.
  protected readonly share = computed(() => Math.floor(Math.round(this.total() * 100) / Math.max(1, this.data.eaters.length)) / 100);
  protected readonly payerName = computed(() => this.data.payers.find(u => u.id === this.paidBy())?.name ?? '');
  // Who paid gets the bill back, less their own share when they ate.
  protected readonly back = computed(() => this.total() - (this.data.eaters.some(u => u.id === this.paidBy()) ? this.share() : 0));
  protected readonly result = computed<BillResult>(() => ({total: Math.round(this.total() * 100) / 100, paidBy: this.paidBy()}));
}
