import {Component, computed, inject} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {Meal, signupOpen} from '../../interfaces/meal';
import {User} from '../../interfaces/user';
import {MealService} from '../../services/meal.service';
import {Notify} from '../../services/notify.service';
import {TranslatePipe} from '../../translate.pipe';
import {ResidentTilesComponent} from './resident-tiles.component';

export interface SignupDialogData {
  // The live meal from the page, so taps on another tablet show up here too.
  meal: () => Meal | undefined;
  title: string;
  residents: User[];
}

// Who eats with: tap yourself in or out, like choosing buyers on the buy page. Each tap is saved
// at once. Once the sign-up has closed this is the cook's list to edit.
@Component({
  selector: 'app-signup-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe, ResidentTilesComponent],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <div mat-dialog-content>
      @if (!open()) {
        <p class="closed" role="status"><mat-icon>lock</mat-icon> {{ "FOOD_COOK_EDITS" | translate }}</p>
      }
      <p class="count">{{ signups().length }} {{ "FOOD_EATERS" | translate }}</p>
      <app-resident-tiles [residents]="data.residents" [selected]="signups()" (picked)="toggle($event)" />
    </div>
    <mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>{{ "FOOD_DONE" | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .count { margin: 0 0 12px; color: var(--mat-sys-on-surface-variant); }
    .closed {
      display: flex; align-items: center; gap: 8px; margin: 0 0 12px; padding: 8px 12px; border-radius: 12px;
      background: var(--mat-sys-tertiary-container); color: var(--mat-sys-on-tertiary-container);
    }
  `,
})
export class SignupDialogComponent {
  protected readonly data = inject<SignupDialogData>(MAT_DIALOG_DATA);
  private readonly meals = inject(MealService);
  private readonly notify = inject(Notify);
  protected readonly open = computed(() => {
    const m = this.data.meal();
    return !!m && signupOpen(m);
  });
  protected readonly signups = computed(() => this.data.meal()?.signups ?? []);

  protected toggle(u: User) {
    const m = this.data.meal();
    if (m) {
      this.meals.setSignup(m, u.id, !this.signups().includes(u.id)).catch(this.notify.error);
    }
  }
}
