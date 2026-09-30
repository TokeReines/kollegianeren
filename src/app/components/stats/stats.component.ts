import {Component, computed, inject, linkedSignal, resource, signal} from '@angular/core';
import {DatePipe, DecimalPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {kr} from '../../format';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {DayRow, ProductRow, Stats, heatLevel} from './stats';
import {StatsService} from './stats.service';

const WEEKDAYS = {da: ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']};

// What the kitchen drinks and when, over a chosen period. No per-resident ranking, on purpose.
@Component({
  selector: 'app-stats',
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatIconModule, TranslatePipe],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss',
})
export class StatsComponent {
  private readonly statsService = inject(StatsService);
  private readonly i18n = inject(TranslateService);

  protected readonly periods = [7, 30, 90];
  protected readonly hours = Array.from({length: 24}, (_, h) => h);
  protected readonly days = signal(30);
  protected readonly showTable = signal(false);
  protected readonly tip = signal<{text: string, x: number, y: number} | null>(null);
  private readonly result = resource({params: () => this.days(), loader: ({params}) => this.statsService.load(params)});
  protected readonly loading = this.result.isLoading;
  // The previous period's numbers stay (dimmed) while the next one loads.
  protected readonly stats = linkedSignal<Stats | undefined, Stats | null>({
    source: () => this.result.hasValue() ? this.result.value() : undefined,
    computation: (next, previous) => next ?? previous?.value ?? null,
  });
  protected readonly maxProductKr = computed(() => Math.max(1, ...(this.stats()?.products ?? []).map(p => p.kr)));
  protected readonly maxDayKr = computed(() => Math.max(1, ...(this.stats()?.daily ?? []).map(d => d.kr)));
  protected readonly weekdays = computed(() => WEEKDAYS[this.i18n.language()]);

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

  protected show(event: MouseEvent, text: string) {
    const page = (event.currentTarget as HTMLElement).closest('.page');
    if (page) {
      const host = page.getBoundingClientRect();
      this.tip.set({text, x: event.clientX - host.left + 12, y: event.clientY - host.top + 12});
    }
  }
}
