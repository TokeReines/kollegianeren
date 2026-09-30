import {Component, DestroyRef, computed, inject, signal} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {switchMap} from 'rxjs';
import {DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatChipsModule} from '@angular/material/chips';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Meal, MealFields, isoWeek, newMeal, signupOpen, weekDays, weekStart} from '../../interfaces/meal';
import {User, byRoom} from '../../interfaces/user';
import {MealService} from '../../services/meal.service';
import {UserService} from '../../services/user.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {joinNames} from '../buy-page/basket';
import {Confirm} from '../confirm-dialog/confirm-dialog.component';
import {ResidentAvatarComponent} from '../shared/resident-avatar.component';
import {CookDialogComponent, CookDialogData} from './cook-dialog.component';
import {MealDialogComponent, MealDialogData} from './meal-dialog.component';
import {SignupDialogComponent, SignupDialogData} from './signup-dialog.component';

// How many faces a meal shows before "+ n".
const FACES = 8;

// Food club, like the shared sheet it replaces: a week of days, one page at a time. Tap a free
// day and who cooks; menu, time and the rest are added later. The others sign up until it closes.
@Component({
  selector: 'app-food-club',
  imports: [DatePipe, MatButtonModule, MatChipsModule, MatIconModule, MatMenuModule, MatTooltipModule,
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

  // Sign-ups close on the minute, and today moves on at midnight, without a reload.
  private readonly now = signal(Date.now());
  // Weeks from this one; the page shows one week at a time.
  protected readonly page = signal(0);
  protected readonly monday = computed(() => weekStart(new Date(this.now()), this.page()).getTime());
  protected readonly weekNumber = computed(() => isoWeek(new Date(this.monday())));
  private readonly meals = toSignal(toObservable(this.monday).pipe(switchMap(ms => {
    const monday = new Date(ms);
    return this.mealService.between(monday, new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7));
  })), {initialValue: []});
  private readonly allResidents = toSignal(inject(UserService).list(), {initialValue: []});
  private readonly residents = computed(() => this.allResidents().filter(u => u.active && !u.movedOutAt).sort(byRoom));
  private readonly byId = computed(() => new Map(this.allResidents().map(u => [u.id, u])));
  protected readonly days = computed(() => weekDays(this.meals(), new Date(this.monday()), new Date(this.now())));
  protected readonly faces = FACES;

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected sunday() {
    const m = new Date(this.monday());
    return new Date(m.getFullYear(), m.getMonth(), m.getDate() + 6);
  }

  // No going back before this week: past dinners are not planned any more.
  protected turn(weeks: number) {
    this.page.update(p => Math.max(0, p + weeks));
  }

  protected isToday(day: Date) {
    return day.toDateString() === new Date(this.now()).toDateString();
  }

  protected open(meal: Meal) {
    return signupOpen(meal, this.now());
  }

  protected resident(id: string): User | undefined {
    return this.byId().get(id);
  }

  protected cooks(meal: Meal): User[] {
    return meal.cooks.map(id => this.resident(id)).filter((u): u is User => !!u);
  }

  protected cookNames(meal: Meal): string {
    return joinNames(this.cooks(meal).map(u => u.name), this.i18n.t('BEERSYSTEM_AND'));
  }

  protected eaters(meal: Meal): User[] {
    return meal.signups.map(id => this.resident(id)).filter((u): u is User => !!u);
  }

  protected book(day: Date) {
    this.dialog.open<CookDialogComponent, CookDialogData, User>(CookDialogComponent,
      {width: '720px', maxWidth: '94vw', data: {day, residents: this.residents()}})
      .afterClosed().subscribe(cook => {
        if (cook) {
          // Refused when another tablet took the day a moment ago.
          this.mealService.add(newMeal(day, cook.id)).catch(e => (e as {code?: string})?.code === 'permission-denied'
            ? this.notify.info(this.i18n.t('FOOD_DAY_TAKEN'), 5000) : this.notify.error(e));
        }
      });
  }

  protected details(meal: Meal) {
    this.dialog.open<MealDialogComponent, MealDialogData, MealFields>(MealDialogComponent,
      {width: '520px', maxWidth: '94vw', data: {meal, residents: this.residents()}})
      .afterClosed().subscribe(fields => {
        if (fields) {
          this.mealService.update(meal, fields)
            .then(moved => moved || this.notify.info(this.i18n.t('FOOD_DAY_TAKEN'), 5000))
            .catch(this.notify.error);
        }
      });
  }

  // A second (or third) cook joins the day.
  protected addCook(meal: Meal) {
    this.dialog.open<CookDialogComponent, CookDialogData, User>(CookDialogComponent, {
      width: '720px', maxWidth: '94vw',
      data: {day: meal.date.toDate(), residents: this.residents().filter(u => !meal.cooks.includes(u.id))},
    }).afterClosed().subscribe(cook => {
      if (cook) {
        this.mealService.addCook(meal, cook.id).catch(this.notify.error);
      }
    });
  }

  protected signups(meal: Meal) {
    this.dialog.open<SignupDialogComponent, SignupDialogData>(SignupDialogComponent, {
      width: '720px', maxWidth: '94vw',
      data: {meal: () => this.meals().find(m => m.id === meal.id), title: this.title(meal), residents: this.residents()},
    });
  }

  // The menu, or "Anna og Bo laver mad" while there is none.
  private title(meal: Meal) {
    return meal.menu || `${this.cookNames(meal)} ${this.i18n.t(meal.cooks.length > 1 ? 'FOOD_COOK_MANY' : 'FOOD_COOKS')}`;
  }

  protected async remove(meal: Meal) {
    const t = (k: string) => this.i18n.t(k);
    const what = this.title(meal);
    if (await this.confirm.ask({title: `${t('DELETE')}: ${what}?`, message: t('FOOD_DELETE_CONFIRM'), confirm: t('DELETE'), danger: true})) {
      this.mealService.delete(meal).catch(this.notify.error);
    }
  }
}
