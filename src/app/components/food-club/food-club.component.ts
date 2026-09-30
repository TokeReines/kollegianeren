import {Component, DestroyRef, computed, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatChipsModule} from '@angular/material/chips';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Meal, MealFields, signupOpen} from '../../interfaces/meal';
import {User, byRoom} from '../../interfaces/user';
import {MealService} from '../../services/meal.service';
import {UserService} from '../../services/user.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {Confirm} from '../confirm-dialog/confirm-dialog.component';
import {ResidentAvatarComponent} from '../shared/resident-avatar.component';
import {MealDialogComponent, MealDialogData} from './meal-dialog.component';
import {SignupDialogComponent, SignupDialogData} from './signup-dialog.component';

// How many faces a card shows before "+ n".
const FACES = 8;

// Food club: a resident offers to cook on a date, the others sign up until the sign-up closes.
@Component({
  selector: 'app-food-club',
  imports: [DatePipe, MatButtonModule, MatCardModule, MatChipsModule, MatIconModule, MatMenuModule, MatTooltipModule,
    TranslatePipe, ResidentAvatarComponent],
  templateUrl: './food-club.component.html',
  styleUrl: './food-club.component.scss',
})
export class FoodClubComponent {
  private readonly mealService = inject(MealService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(TranslateService);
  private readonly confirm = inject(Confirm);

  protected readonly meals = toSignal(this.mealService.upcoming(), {initialValue: []});
  private readonly allResidents = toSignal(inject(UserService).list(), {initialValue: []});
  private readonly residents = computed(() => this.allResidents().filter(u => u.active && !u.movedOutAt).sort(byRoom));
  private readonly byId = computed(() => new Map(this.allResidents().map(u => [u.id, u])));
  // Sign-ups close on the minute without a reload.
  private readonly now = signal(Date.now());
  protected readonly faces = FACES;

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected open(meal: Meal) {
    return signupOpen(meal, this.now());
  }

  protected resident(id: string): User | undefined {
    return this.byId().get(id);
  }

  protected eaters(meal: Meal): User[] {
    return meal.signups.map(id => this.resident(id)).filter((u): u is User => !!u);
  }

  protected edit(meal: Meal | null = null) {
    this.dialog.open<MealDialogComponent, MealDialogData, MealFields>(MealDialogComponent,
      {width: '520px', maxWidth: '94vw', data: {meal, residents: this.residents()}})
      .afterClosed().subscribe(fields => {
        if (fields) {
          (meal ? this.mealService.update(meal, fields) : this.mealService.add(fields)).catch(this.notify.error);
        }
      });
  }

  protected signups(meal: Meal) {
    this.dialog.open<SignupDialogComponent, SignupDialogData>(SignupDialogComponent, {
      width: '720px', maxWidth: '94vw',
      data: {meal: () => this.meals().find(m => m.id === meal.id), residents: this.residents()},
    });
  }

  protected async remove(meal: Meal) {
    const t = (k: string) => this.i18n.t(k);
    if (await this.confirm.ask({title: `${t('DELETE')} ${meal.menu}?`, message: t('FOOD_DELETE_CONFIRM'), confirm: t('DELETE'), danger: true})) {
      this.mealService.delete(meal).catch(this.notify.error);
    }
  }
}
