import {Component, computed, inject, resource, signal} from '@angular/core';
import {DatePipe, DecimalPipe, LowerCasePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {KitchenStats, UsageCell, UsagePeriod, UsageWho, lastActive, summarise, trend, usageDays, usageGrid, usageHours} from '../../interfaces/admin-stats';
import {USAGE_ACTIONS, USAGE_PAGES, usageLabel} from '../../interfaces/usage';
import {AdminService} from '../../services/admin.service';
import {TranslatePipe} from '../../translate.pipe';
import {TranslateService} from '../../services/translate.service';

// Spark plan: document reads per day.
const READ_CAP = 50000;

// The maker's overview of how the kitchens use Kollegianeren: numbers per kitchen from the daily
// ops/admin-stats.js job. One read per visit. No residents' names, by design (see the privacy page).
@Component({
  selector: 'app-admin',
  imports: [DatePipe, DecimalPipe, LowerCasePipe, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe],
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
  protected readonly open = signal<string | null>(null);
  protected readonly readCap = READ_CAP;
  protected readonly maxReads = computed(() => Math.max(1, ...(this.stats()?.usage ?? []).map(u => u.reads)));

  // How the app is used: pages or actions by kitchen, for a period and kind of login.
  protected readonly usageKind = signal<'v' | 'a'>('v');
  protected readonly usagePeriod = signal<UsagePeriod>('d30');
  protected readonly usageWho = signal<UsageWho>('all');
  protected readonly counted = computed(() => (this.stats()?.kitchens ?? []).filter(k => k.usage && Object.keys(k.usage.days).length));
  protected readonly grid = computed(() => usageGrid(this.counted(), this.usageKind() === 'v' ? USAGE_PAGES : USAGE_ACTIONS,
    this.usageKind(), this.usagePeriod(), this.usageWho()));
  protected readonly hours = computed(() => usageHours(this.counted()));
  protected readonly maxHour = computed(() => Math.max(1, ...this.hours()));
  protected readonly days = computed(() => usageDays(this.counted()));
  protected readonly maxDay = computed(() => Math.max(1, ...this.days().map(d => d.n)));

  protected label(key: string) {
    return usageLabel(this.usageKind(), key);
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
