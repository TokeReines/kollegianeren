import {Component, computed, inject, signal} from '@angular/core';
import {DatePipe, DecimalPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {EXPENSES_MAX, EXPENSE_NOTE_MAX, Meal, MealExpense, expensesTotal, signupOpen, splitExpenses} from '../../interfaces/meal';
import {User} from '../../interfaces/user';
import {MealService} from '../../services/meal.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';

export interface BillDialogData {
  // The live meal from the page, so an expense added on another tablet shows up here too.
  meal: () => Meal | undefined;
  title: string;
  // Who may have paid: the cooks first, then the eaters, then the other residents.
  payers: User[];
  residents: Map<string, User>;
}

// A dinner's expenses: what each resident spent on it, added whenever they shopped (days before,
// too), with what for if they like.
// Once it has been eaten (the sign-up closed, the day come) they are split: every eater pays an equal
// share, and everyone who paid gets back what they paid, all in Regnskab (MealService.splitBill).
@Component({
  selector: 'app-bill-dialog',
  imports: [DatePipe, DecimalPipe, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatSelectModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ "FOOD_EXPENSES_TITLE" | translate }}: {{ data.title }}</h2>
    <div mat-dialog-content class="content">
      @if (meal(); as m) {
        <div class="list">
          @for (e of m.expenses ?? []; track e.id) {
            <div class="expense">
              <div class="what">
                <b>{{ name(e.by) }}</b>
                <span class="hint">{{ e.note || ("FOOD_EXPENSE_ALL" | translate) }} · {{ e.at.toDate() | date:'d/M' }}</span>
              </div>
              <b class="kr">{{ e.kr | number:'1.2-2' }} kr.</b>
              @if (!m.bill) {
                <button mat-icon-button type="button" (click)="remove(e)" [attr.aria-label]="'DELETE' | translate"><mat-icon>close</mat-icon></button>
              }
            </div>
          } @empty {
            <p class="hint">{{ "FOOD_EXPENSES_NONE" | translate }}</p>
          }
          @if (total()) {
            <div class="expense total"><span class="what">{{ "FOOD_EXPENSES_TOTAL" | translate }}</span><b class="kr">{{ total() | number:'1.2-2' }} kr.</b></div>
          }
        </div>

        @if (!m.bill) {
          <form class="add" (submit)="$event.preventDefault(); add()">
            <mat-form-field class="amount" subscriptSizing="dynamic">
              <mat-label>{{ "FOOD_EXPENSE_KR" | translate }}</mat-label>
              <input matInput name="kr" type="number" inputmode="decimal" min="1" max="20000" step="0.01" [ngModel]="kr() || null"
                     (ngModelChange)="kr.set(+$event)" autocomplete="off">
              <span matTextSuffix>kr.</span>
            </mat-form-field>
            <mat-form-field class="by" subscriptSizing="dynamic">
              <mat-label>{{ "FOOD_BILL_PAID_BY" | translate }}</mat-label>
              <mat-select name="by" [ngModel]="by()" (ngModelChange)="by.set($event)">
                @for (u of data.payers; track u.id) {
                  <mat-option [value]="u.id">{{ u.name }}@if (u.room) { ({{ u.room }}) }</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field class="note" subscriptSizing="dynamic">
              <mat-label>{{ "FOOD_EXPENSE_NOTE" | translate }}</mat-label>
              <input matInput name="note" [ngModel]="note()" (ngModelChange)="note.set($event)" [maxlength]="noteMax"
                     [placeholder]="'FOOD_EXPENSE_ALL' | translate" autocomplete="off">
            </mat-form-field>
            <button mat-stroked-button type="submit" [disabled]="!canAdd()"><mat-icon>add</mat-icon> {{ "FOOD_EXPENSE_ADD" | translate }}</button>
          </form>
          @if (canSplit()) {
            <p class="preview">{{ m.signups.length }} {{ "FOOD_BILL_ATE" | translate }}: {{ share() | number:'1.2-2' }} kr. {{ "FOOD_BILL_EACH" | translate }}.
              @for (b of back(); track b.userId) { {{ name(b.userId) }} {{ "FOOD_BILL_GETS_BACK" | translate }} {{ b.kr | number:'1.2-2' }} kr. }</p>
          } @else if (total()) {
            <p class="hint">{{ "FOOD_EXPENSES_SPLIT_LATER" | translate }}</p>
          }
        } @else {
          <p class="preview">{{ "FOOD_BILL_DONE" | translate }} {{ m.bill.share | number:'1.2-2' }} kr. {{ "FOOD_BILL_EACH" | translate }}</p>
        }
      }
    </div>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">{{ "CLOSE" | translate }}</button>
      @if (canSplit()) {
        <button mat-flat-button type="button" (click)="split()">{{ "FOOD_BILL_SPLIT" | translate }}</button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; gap: 12px; }
    p { margin: 0; }
    .list { display: flex; flex-direction: column; }
    .expense { display: flex; align-items: center; gap: 8px; min-height: 48px; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    .expense .what { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow-wrap: anywhere; }
    .expense .kr { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .expense.total { border-bottom: none; }
    .hint { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 8px; }
    .add .amount { width: 130px; }
    .add .by { width: 200px; }
    .add .note { flex: 1; min-width: 140px; }
    .preview { padding: 8px 12px; border-radius: 12px; background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); }
  `,
})
export class BillDialogComponent {
  protected readonly data = inject<BillDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<BillDialogComponent>);
  private readonly meals = inject(MealService);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(TranslateService);

  protected readonly meal = computed(() => this.data.meal());
  protected readonly kr = signal(0);
  protected readonly by = signal(this.data.payers[0]?.id ?? '');
  protected readonly note = signal('');
  protected readonly noteMax = EXPENSE_NOTE_MAX;

  protected readonly total = computed(() => this.meal() ? expensesTotal(this.meal()!) : 0);
  protected readonly canAdd = computed(() => this.kr() > 0 && this.kr() <= 20000 && !!this.by() && (this.meal()?.expenses?.length ?? 0) < EXPENSES_MAX);
  // Split once it has been eaten: the day has come and nobody can sign up any more.
  protected readonly canSplit = computed(() => {
    const m = this.meal();
    if (!m || m.bill || !this.total() || !m.signups.length || signupOpen(m)) {
      return false;
    }
    const day = m.date.toDate();
    return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() <= Date.now();
  });
  private readonly lines = computed(() => this.meal() ? splitExpenses(this.meal()!.expenses ?? [], this.meal()!.signups) : []);
  protected readonly share = computed(() => Math.floor(Math.round(this.total() * 100) / Math.max(1, this.meal()?.signups.length ?? 1)) / 100);
  // Who gets money back: everyone who paid more than their own share.
  protected readonly back = computed(() => this.lines().filter(l => l.price < 0).map(l => ({userId: l.userId, kr: -l.price})));

  protected name(id: string) {
    return this.data.residents.get(id)?.name ?? '?';
  }

  protected add() {
    const m = this.meal();
    if (!m || !this.canAdd()) {
      return;
    }
    this.meals.addExpense(m, {by: this.by(), kr: this.kr(), note: this.note()}).then(() => {
      this.kr.set(0);
      this.note.set('');
    }, this.notify.error);
  }

  protected remove(e: MealExpense) {
    const m = this.meal();
    if (m) {
      this.meals.removeExpense(m, e).catch(this.notify.error);
    }
  }

  protected split() {
    const m = this.meal();
    if (m && this.canSplit()) {
      this.meals.splitBill(m, this.data.residents)
        .then(() => {
          this.notify.info(this.i18n.t('FOOD_BILL_SPLIT_DONE'), 4000);
          this.ref.close();
        }, this.notify.error);
    }
  }
}
