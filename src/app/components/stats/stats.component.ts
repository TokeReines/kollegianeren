import {Component, computed, inject, linkedSignal, resource, signal} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {of, switchMap} from 'rxjs';
import {DatePipe, DecimalPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {byRoom} from '../../interfaces/user';
import {UserService} from '../../services/user.service';
import {kr} from '../../format';
import {joinNames} from '../buy-page/basket';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {DayRow, ProductRow, Stats, heatLevel} from './stats';
import {StatsService} from './stats.service';
import {FoodDayRow, FoodStats, WeekdayRow} from './food-stats';
import {UsageService} from '../../services/usage.service';

const WEEKDAYS = {da: ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']};

// What the kitchen drinks and eats, and when, over a chosen period. No per-resident ranking of what
// people drink, on purpose; the food club does show who cooks, since cooking is what it is about.
@Component({
  selector: 'app-stats',
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatIconModule, TranslatePipe],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss',
})
export class StatsComponent {
  protected readonly usage = inject(UsageService);
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
  // The residents are read only for the Madklub view, for the names in its charts.
  private readonly allResidents = toSignal(toObservable(this.view).pipe(
    switchMap(v => v === 'food' ? this.users.list() : of([]))), {initialValue: []});
  private readonly names = computed(() => new Map(this.allResidents().map(u => [u.id, u.name])));
  // Everyone who ate or cooked in the period.
  // cookedShare: the part of their bar (times eaten) that they cooked themselves.
  private readonly personRows = computed(() => Object.entries(this.food()?.people ?? {})
    .map(([id, p]) => ({id, name: this.names().get(id) ?? '?', ...p, cookedShare: p.ate ? Math.min(p.cooked, p.ate) / p.ate : 0})));
  protected readonly byAte = computed(() => this.personRows().filter(r => r.ate > 0)
    .sort((a, b) => b.ate - a.ate || b.cooked - a.cooked || a.name.localeCompare(b.name, 'da')));
  // The table: everyone, by room.
  protected readonly byRoomRows = computed(() => {
    const rooms = new Map(this.allResidents().map(u => [u.id, u.room]));
    return [...this.personRows()].sort((a, b) => byRoom({room: rooms.get(a.id) ?? ''}, {room: rooms.get(b.id) ?? ''}));
  });
  protected readonly maxAte = computed(() => Math.max(1, ...this.personRows().map(r => r.ate)));
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
  // The previous period's numbers stay (dimmed) while the next one loads.
  protected readonly stats = linkedSignal<Stats | undefined, Stats | null>({
    source: () => this.result.hasValue() ? this.result.value() : undefined,
    computation: (next, previous) => next ?? previous?.value ?? null,
  });
  protected readonly maxProductKr = computed(() => Math.max(1, ...(this.stats()?.products ?? []).map(p => p.kr)));
  protected readonly maxDayKr = computed(() => Math.max(1, ...(this.stats()?.daily ?? []).map(d => d.kr)));
  protected readonly weekdays = computed(() => WEEKDAYS[this.i18n.language()]);

  protected setView(view: 'beer' | 'food') {
    if (view === 'food') {
      this.usage.act('stats-food');
    }
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
    if (!d.meals) {
      return `${day}: ${this.i18n.t('FOOD_STATS_NONE')}`;
    }
    // "tors. 24. sep.: 12 spiser med. Kok: Anna og Bo"
    const cooks = joinNames(d.cooks.map(id => this.names().get(id) ?? '?'), this.i18n.t('BEERSYSTEM_AND'));
    return `${day}: ${d.eaters} ${this.i18n.t('FOOD_EATERS')}. ${this.i18n.t(d.cooks.length > 1 ? 'FOOD_COOKS_LABEL' : 'FOOD_COOK_ONE')}: ${cooks}`;
  }

  protected tipWeekday(w: WeekdayRow) {
    const avg = w.meals ? Math.round(w.eaters / w.meals * 10) / 10 : 0;
    return `${this.weekdays()[w.weekday]}: ${w.meals} ${this.i18n.t('FOOD_STATS_MEALS').toLowerCase()}, ${avg} ${this.i18n.t('FOOD_STATS_PER_MEAL').toLowerCase()}`;
  }

  // "Anna: spiste med 12 gange, lavede mad 2 gange for i alt 27 spisende".
  protected tipPerson(r: {name: string, ate: number, cooked: number, guests: number}) {
    const times = (n: number) => `${n} ${this.i18n.t(n === 1 ? 'FOOD_STATS_TIME' : 'FOOD_STATS_TIMES')}`;
    const cooked = `${this.i18n.t('FOOD_STATS_COOKED')} ${times(r.cooked)}`;
    return `${r.name}: ${this.i18n.t('FOOD_STATS_ATE').toLowerCase()} ${times(r.ate)}, ${cooked}` +
      (r.cooked ? ` ${this.i18n.t('FOOD_STATS_FOR')} ${r.guests} ${this.i18n.t('FOOD_STATS_GUESTS').toLowerCase()}` : '');
  }

  protected show(event: MouseEvent, text: string) {
    const page = (event.currentTarget as HTMLElement).closest('.page');
    if (page) {
      const host = page.getBoundingClientRect();
      this.tip.set({text, x: event.clientX - host.left + 12, y: event.clientY - host.top + 12});
    }
  }
}
