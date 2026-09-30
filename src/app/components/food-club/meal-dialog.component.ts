import {Component, inject} from '@angular/core';
import {NonNullableFormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {Timestamp} from 'firebase/firestore';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatChipsModule} from '@angular/material/chips';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {CLOSE_HOURS, MEAL_TAGS, Meal, MealFields, MealTag, atTime, closeHours, closeHoursFor} from '../../interfaces/meal';
import {User} from '../../interfaces/user';
import {TranslatePipe} from '../../translate.pipe';

export interface MealDialogData {
  meal: Meal | null;
  residents: User[];
}

const pad = (n: number) => String(n).padStart(2, '0');

// A new meal (meal null) or editing one. Closes with the meal's fields, or nothing.
@Component({
  selector: 'app-meal-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatChipsModule, MatDatepickerModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatSlideToggleModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ "FOOD_EDIT" | translate }}</h2>
    <form mat-dialog-content [formGroup]="form" (ngSubmit)="save()" id="meal-form">
      <mat-form-field class="first">
        <mat-label>{{ "FOOD_MENU" | translate }}</mat-label>
        <input matInput formControlName="menu" maxlength="200" autocomplete="off" cdkFocusInitial>
      </mat-form-field>
      <div class="when">
        <mat-form-field>
          <mat-label>{{ "FOOD_DATE" | translate }}</mat-label>
          <input matInput [matDatepicker]="picker" [min]="minDay" formControlName="day" readonly (click)="picker.open()">
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ "FOOD_TIME" | translate }}</mat-label>
          <input matInput type="time" formControlName="time">
        </mat-form-field>
      </div>
      <mat-form-field>
        <mat-label>{{ "FOOD_COOKS_LABEL" | translate }}</mat-label>
        <mat-select formControlName="cooks" multiple>
          @for (u of residents; track u.id) {
            <mat-option [value]="u.id">{{ u.name }} ({{ u.room }})</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ "FOOD_NOTES" | translate }}</mat-label>
        <textarea matInput formControlName="notes" rows="3" maxlength="2000"></textarea>
        <mat-hint>{{ "FOOD_NOTES_HINT" | translate }}</mat-hint>
      </mat-form-field>
      <div class="tags">
        <span class="label">{{ "FOOD_TAGS" | translate }}</span>
        <mat-chip-listbox multiple formControlName="tags" [attr.aria-label]="'FOOD_TAGS' | translate">
          @for (t of tagOptions; track t) {
            <mat-chip-option [value]="t">{{ "FOOD_TAG_" + t | translate }}</mat-chip-option>
          }
        </mat-chip-listbox>
      </div>
      <mat-form-field>
        <mat-label>{{ "FOOD_CLOSES" | translate }}</mat-label>
        <mat-select formControlName="closeHours">
          @for (h of closeOptions; track h) {
            <mat-option [value]="h">{{ "FOOD_CLOSES_" + h | translate }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-slide-toggle formControlName="askCook">{{ "FOOD_ASK_COOK" | translate }}</mat-slide-toggle>
      <p class="hint">{{ "FOOD_ASK_COOK_HINT" | translate }}</p>
    </form>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">{{ "CANCEL" | translate }}</button>
      <button mat-flat-button type="submit" form="meal-form" [disabled]="form.invalid">{{ "SAVE" | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    form { display: flex; flex-direction: column; gap: 12px; }
    /* Room for the first field's floating label, which the dialog content would clip. */
    .first { margin-top: 8px; }
    .when { display: grid; grid-template-columns: 3fr 2fr; gap: 12px; }
    .tags { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
    .label, .hint { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .hint { margin: -4px 0 0; }
  `,
})
export class MealDialogComponent {
  private readonly data = inject<MealDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<MealDialogComponent, MealFields>>(MatDialogRef);
  protected readonly meal = this.data.meal;
  protected readonly residents = this.data.residents;
  protected readonly tagOptions = MEAL_TAGS;
  protected readonly closeOptions = CLOSE_HOURS;
  // New dates from today on; a past meal (history) keeps its own date valid.
  private readonly today = new Date(new Date().setHours(0, 0, 0, 0));
  protected readonly minDay = this.meal && this.meal.date.toDate() < this.today ? null : this.today;

  private readonly date = this.meal?.date.toDate() ?? null;
  protected readonly form = inject(NonNullableFormBuilder).group({
    day: [this.date as Date | null, Validators.required],
    time: [this.date ? `${pad(this.date.getHours())}:${pad(this.date.getMinutes())}` : '18:30', Validators.required],
    cooks: [[...(this.meal?.cooks ?? [])], [Validators.required, Validators.maxLength(6)]],
    menu: [this.meal?.menu ?? '', Validators.maxLength(200)],
    notes: [this.meal?.notes ?? '', Validators.maxLength(2000)],
    tags: [[...(this.meal?.tags ?? [])] as MealTag[]],
    closeHours: [this.meal ? closeHours(this.meal) : 24 as number],
    askCook: [this.meal?.askCook ?? false],
  });

  protected save() {
    const v = this.form.getRawValue();
    if (this.form.invalid || !v.day) {
      return;
    }
    const date = atTime(v.day, v.time);
    // Editing the menu after the sign-up closed keeps it closed. A new date or closing choice
    // never lands on a time already passed, for a dinner still to come.
    const unchanged = this.meal && date.getTime() === this.meal.date.toMillis() && v.closeHours === closeHours(this.meal);
    this.ref.close({
      date: Timestamp.fromDate(date),
      closesAt: unchanged && this.meal ? this.meal.closesAt : Timestamp.fromMillis(date.getTime() - closeHoursFor(date, v.closeHours) * 3.6e6),
      cooks: v.cooks, menu: v.menu.trim(), notes: v.notes.trim(), tags: v.tags, askCook: v.askCook,
    });
  }
}
