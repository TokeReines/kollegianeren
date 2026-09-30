import {Component, computed, inject, linkedSignal, resource, signal} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {map, of, switchMap} from 'rxjs';
import {DatePipe, DecimalPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatSelectModule} from '@angular/material/select';
import {byRoom} from '../../interfaces/user';
import {UserService} from '../../services/user.service';
import {kr} from '../../format';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {DayRow, ProductRow, Stats, heatLevel} from './stats';
import {StatsService} from './stats.service';
import {FoodDayRow, FoodStats, TagRow, WeekdayRow} from './food-stats';

const WEEKDAYS = {da: ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']};

// What the kitchen drinks and eats, and when, over a chosen period. No per-resident ranking, on purpose.
@Component({
  selector: 'app-stats',
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatFormFieldModule, MatIconModule, MatSelectModule, TranslatePipe],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss',
})
export class StatsComponent {
  private readonly statsService = inject(StatsService);
  private readonly i18n = inject(TranslateService);
  private readonly users = inject(UserService);

  protected readonly hours = Array.from({length: 24}, (_, h) => h);
  protected readonly days = signal(30);
  protected readonly showTable = signal(false);
  protected readonly tip = signal<{text: string, x: number, y: number} | null>(null);
  // Ølsystem or Madklub; only the one shown is read.
  protected readonly view = signal<'beer' | 'food'>('beer');
  // A year of food club is a few hundred reads; a year of purchases would be thousands.
  protected readonly periods = computed(() => this.view() === 'food' ? [30, 90, 365] : [7, 30, 90]);
  // One resident's own food club count, picked on the page. The residents are read only here.
  protected readonly personId = signal('');
  protected readonly residents = toSignal(toObservable(this.view).pipe(
    switchMap(v => v === 'food' ? this.users.list() : of([])),
    map(list => list.filter(u => !u.movedOutAt).sort(byRoom))), {initialValue: []});
  protected readonly person = computed(() => {
    const id = this.personId(), f = this.food();
    return id && f ? f.people[id] ?? {ate: 0, cooked: 0} : null;
  });
  private readonly result = resource({
    params: () => this.view() === 'beer' ? this.days() : undefined,
    loader: ({params}) => this.statsService.load(params),
  });
  private readonly foodResult = resource({
    params: () => this.view() === 'food' ? this.days() : undefined,
    loader: ({params}) => this.statsService.loadFood(params),
  });
  protected readonly loading = computed(() => this.result.isLoading() || this.foodResult.isLoading());
  protected readonly food = linkedSignal<FoodStats | undefined, FoodStats | null>({
    source: () => this.foodResult.hasValue() ? this.foodResult.value() : undefined,
    computation: (next, previous) => next ?? previous?.value ?? null,
  });
  protected readonly maxDayEaters = computed(() => Math.max(1, ...(this.food()?.daily ?? []).map(d => d.eaters)));
  protected readonly maxWeekdayMeals = computed(() => Math.max(1, ...(this.food()?.weekdays ?? []).map(d => d.meals)));
  protected readonly maxTagMeals = computed(() => Math.max(1, ...(this.food()?.tags ?? []).map(t => t.meals)));
  // The previous period's numbers stay (dimmed) while the next one loads.
  protected readonly stats = linkedSignal<Stats | undefined, Stats | null>({
    source: () => this.result.hasValue() ? this.result.value() : undefined,
    computation: (next, previous) => next ?? previous?.value ?? null,
  });
  protected readonly maxProductKr = computed(() => Math.max(1, ...(this.stats()?.products ?? []).map(p => p.kr)));
  protected readonly maxDayKr = computed(() => Math.max(1, ...(this.stats()?.daily ?? []).map(d => d.kr)));
  protected readonly weekdays = computed(() => WEEKDAYS[this.i18n.language()]);

  protected setView(view: 'beer' | 'food') {
    this.view.set(view);
    if (!this.periods().includes(this.days())) {
      this.days.set(30);
    }
  }

  protected level(count: number): number {
    return heatLevel(count, this.stats()?.heatSteps ?? []);
  }

  protected tipProduct(p: ProductRow) {
    return `${p.name}: ${kr(p.kr)}, ${p.units} ${this.i18n.t('PIECES')}`;
  }

  protected tipDay(d: DayRow) {
    const day = new Intl.DateTimeFormat('da-DK', {weekday: 'short', day: 'numeric', month: 'short'}).format(d.date);
    return `${day}: ${kr(d.kr)}, ${d.purchases} ${this.i18n.t('STATS_PURCHASES').toLowerCase()}`;
  }

  protected tipCell(weekday: number, hour: number, count: number) {
    return `${this.weekdays()[weekday]} ${hour}-${hour + 1}: ${count} ${this.i18n.t('STATS_PURCHASES').toLowerCase()}`;
  }

  protected tipFoodDay(d: FoodDayRow) {
    const day = new Intl.DateTimeFormat('da-DK', {weekday: 'short', day: 'numeric', month: 'short'}).format(d.date);
    return d.meals ? `${day}: ${d.eaters} ${this.i18n.t('FOOD_EATERS')}` : `${day}: ${this.i18n.t('FOOD_STATS_NONE')}`;
  }

  protected tipWeekday(w: WeekdayRow) {
    const avg = w.meals ? Math.round(w.eaters / w.meals * 10) / 10 : 0;
    return `${this.weekdays()[w.weekday]}: ${w.meals} ${this.i18n.t('FOOD_STATS_MEALS').toLowerCase()}, ${avg} ${this.i18n.t('FOOD_STATS_PER_MEAL').toLowerCase()}`;
  }

  protected tipTag(t: TagRow) {
    return `${this.i18n.t('FOOD_TAG_' + t.tag)}: ${t.meals} ${this.i18n.t('FOOD_STATS_MEALS').toLowerCase()}`;
  }

  protected show(event: MouseEvent, text: string) {
    const page = (event.currentTarget as HTMLElement).closest('.page');
    if (page) {
      const host = page.getBoundingClientRect();
      this.tip.set({text, x: event.clientX - host.left + 12, y: event.clientY - host.top + 12});
    }
  }
}
