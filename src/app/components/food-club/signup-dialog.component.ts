import {Component, computed, inject} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {Meal, signupOpen} from '../../interfaces/meal';
import {User} from '../../interfaces/user';
import {MealService} from '../../services/meal.service';
import {Notify} from '../../services/notify.service';
import {TranslatePipe} from '../../translate.pipe';
import {ResidentAvatarComponent} from '../shared/resident-avatar.component';

export interface SignupDialogData {
  // The live meal from the page, so taps on another tablet show up here too.
  meal: () => Meal | undefined;
  residents: User[];
}

// Who eats with: tap yourself in or out, like choosing buyers on the buy page. Each tap is saved
// at once. Once the sign-up has closed this is the cook's list to edit.
@Component({
  selector: 'app-signup-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe, ResidentAvatarComponent],
  template: `
    <h2 mat-dialog-title>{{ meal()?.menu }}</h2>
    <div mat-dialog-content>
      @if (!open()) {
        <p class="closed" role="status"><mat-icon>lock</mat-icon> {{ "FOOD_COOK_EDITS" | translate }}</p>
      }
      <p class="count">{{ eaters() }} {{ "FOOD_EATERS" | translate }}</p>
      <div class="grid">
        @for (u of data.residents; track u.id) {
          <button type="button" class="tile" [class.selected]="eats(u)" [attr.aria-pressed]="eats(u)" (click)="toggle(u)">
            <app-resident-avatar [resident]="u" [size]="40" />
            <span class="text"><span class="name">{{ u.name }}</span><span class="room">{{ u.room }}</span></span>
            @if (eats(u)) {
              <mat-icon class="check">check_circle</mat-icon>
            }
          </button>
        }
      </div>
    </div>
    <mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>{{ "FOOD_DONE" | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
    .tile {
      display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 6px 10px; text-align: left;
      border: 1px solid var(--mat-sys-outline-variant); border-radius: 12px; cursor: pointer;
      background: var(--mat-sys-surface); color: var(--mat-sys-on-surface); font: inherit;
    }
    .tile.selected { background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); border-color: transparent; }
    .text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .name { font: var(--mat-sys-title-small); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .room { font: var(--mat-sys-body-small); opacity: 0.8; }
    .check { color: var(--mat-sys-primary); }
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
  protected readonly meal = computed(() => this.data.meal());
  protected readonly open = computed(() => {
    const m = this.meal();
    return !!m && signupOpen(m);
  });
  protected readonly eaters = computed(() => this.meal()?.signups.length ?? 0);

  protected eats(u: User) {
    return !!this.meal()?.signups.includes(u.id);
  }

  protected toggle(u: User) {
    const m = this.meal();
    if (m) {
      this.meals.setSignup(m, u.id, !this.eats(u)).catch(this.notify.error);
    }
  }
}
