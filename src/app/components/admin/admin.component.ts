import {Component, computed, inject, resource, signal} from '@angular/core';
import {DatePipe, DecimalPipe, LowerCasePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {KitchenStats, UsageCell, UsagePeriod, UsageWho, lastActive, summarise, trend, usageDays, usageGrid, usageHours} from '../../interfaces/admin-stats';
import {USAGE_ACTIONS, USAGE_PAGES, usageLabel} from '../../interfaces/usage';
import {AdminService, Nightly} from '../../services/admin.service';
import {TranslatePipe} from '../../translate.pipe';
import {TranslateService} from '../../services/translate.service';
import {MatButtonToggleModule} from '@angular/material/button-toggle';

// Spark plan: document reads per day.
const READ_CAP = 50000;

// The maker's overview of how the kitchens use Kollegianeren: numbers per kitchen from the daily
// ops/admin-stats.js job. One read per visit. No residents' names, by design (see the privacy page).
@Component({
  selector: 'app-admin',
  imports: [MatButtonToggleModule, DatePipe, DecimalPipe, LowerCasePipe, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent {
  private readonly admin = inject(AdminService);
  private readonly i18n = inject(TranslateService);
  private readonly result = resource({loader: () => this.admin.latest()});
  protected readonly stats = computed(() => this.result.hasValue() ? this.result.value() : null);
  protected readonly loading = this.result.isLoading;
  protected readonly error = this.result.error;
  protected readonly summary = computed(() => summarise(this.stats()?.kitchens ?? []));
  private readonly nightlyResult = resource({loader: () => this.admin.nightly()});
  protected readonly nightly = computed(() => this.nightlyResult.hasValue() ? this.nightlyResult.value() : null);
  protected readonly open = signal<string | null>(null);
  protected readonly readCap = READ_CAP;
  protected readonly maxReads = computed(() => Math.max(1, ...(this.stats()?.usage ?? []).map(u => u.reads)));

  // How the app is used: pages or actions by kitchen, for a period and kind of login.
  protected readonly usageKind = signal<'v' | 'a' | 'r'>('v');
  protected readonly usagePeriod = signal<UsagePeriod>('d30');
  protected readonly usageWho = signal<UsageWho>('all');
  protected readonly counted = computed(() => (this.stats()?.kitchens ?? []).filter(k => k.usage && Object.keys(k.usage.days).length));
  // The grid's columns: the kitchens, and the maker last when it has counts.
  protected readonly columns = computed(() => {
    const maker = this.stats()?.makerUsage;
    return maker ? [...this.counted(), {id: 'maker', name: this.i18n.t('ADMIN_MAKER'), usage: maker} as KitchenStats] : this.counted();
  });
  protected readonly grid = computed(() => {
    const kind = this.usageKind();
    // Reads have no fixed list: whatever was read, most first, and no "not used".
    const g = usageGrid(this.columns(), kind === 'v' ? USAGE_PAGES : kind === 'a' ? USAGE_ACTIONS : [], kind,
      this.usagePeriod(), this.usageWho());
    return kind === 'r' ? {rows: g.rows.slice(0, 40), unused: []} : g;
  });
  protected readonly hours = computed(() => usageHours(this.counted()));
  protected readonly maxHour = computed(() => Math.max(1, ...this.hours()));
  protected readonly days = computed(() => usageDays(this.counted()));
  protected readonly maxDay = computed(() => Math.max(1, ...this.days().map(d => d.n)));

  // Two days without a backup or summaries: tokeserver is down, and Regnskab and Statistik read more.
  protected stale(n: Nightly) {
    const old = Date.now() - 48 * 36e5;
    return !n.backupAt || n.backupAt.toMillis() < old || n.summariesAt.toMillis() < old;
  }

  // A row's name: a page or an action, or for reads "Regnskab · purchases (åbnet)".
  protected label(key: string) {
    const kind = this.usageKind();
    if (kind !== 'r') {
      return this.i18n.t(usageLabel(kind, key));
    }
    const [page, source, how] = key.split('|');
    const known = (USAGE_PAGES as readonly string[]).includes(page);
    const where = known ? this.i18n.t(usageLabel('v', page)) : page;
    return `${where} · ${source} (${this.i18n.t('ADMIN_READS_' + (how ?? '').toUpperCase())})`;
  }

  protected cellTip(k: KitchenStats, c: UsageCell) {
    const t = this.i18n.t('ADMIN_USAGE_TABLET').toLowerCase();
    const m = this.i18n.t('ADMIN_USAGE_MANAGERS').toLowerCase();
    return `${k.name}: ${c.n} (${t} ${c.t}, ${m} ${c.m})`;
  }

  protected kitchenHours(k: KitchenStats) {
    return k.usage?.hours ?? [];
  }

  protected maxOf(list: number[]) {
    return Math.max(1, ...list);
  }

  protected trend(k: KitchenStats) {
    return trend(k.purchases.last7, k.purchases.prev7);
  }

  protected lastActive(k: KitchenStats): Date | null {
    const ms = lastActive(k);
    return ms ? new Date(ms) : null;
  }

  protected toggle(k: KitchenStats) {
    this.open.update(id => id === k.id ? null : k.id);
  }

  protected activeProducts(k: KitchenStats) {
    return k.products.filter(p => p.active).length;
  }
}
