import {Component, computed, inject, resource, signal} from '@angular/core';
import {DatePipe, DecimalPipe, LowerCasePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {KitchenStats, lastActive, summarise, trend} from '../../interfaces/admin-stats';
import {AdminService} from '../../services/admin.service';
import {TranslatePipe} from '../../translate.pipe';

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
  private readonly result = resource({loader: () => this.admin.latest()});
  protected readonly stats = computed(() => this.result.hasValue() ? this.result.value() : null);
  protected readonly loading = this.result.isLoading;
  protected readonly error = this.result.error;
  protected readonly summary = computed(() => summarise(this.stats()?.kitchens ?? []));
  protected readonly open = signal<string | null>(null);
  protected readonly readCap = READ_CAP;
  protected readonly maxReads = computed(() => Math.max(1, ...(this.stats()?.usage ?? []).map(u => u.reads)));

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
