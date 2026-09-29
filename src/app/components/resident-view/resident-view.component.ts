import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {ResidentLinkService, ResidentTab} from '../../services/resident-link.service';
import {TranslateService} from '../../services/translate.service';

interface MonthRow { label: Date; kr: number; count: number; }

// What a resident sees on their own phone from their private link: this month, the last months,
// and their latest purchases. No kitchen login involved.
@Component({
  selector: 'app-resident-view',
  templateUrl: './resident-view.component.html',
  styleUrls: ['./resident-view.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class ResidentViewComponent implements OnInit {
  loading = true;
  notFound = false;
  tab: ResidentTab | null = null;
  months: MonthRow[] = [];

  constructor(private route: ActivatedRoute, private links: ResidentLinkService, public translate: TranslateService) {
  }

  async ngOnInit() {
    try {
      this.tab = await this.links.open(this.route.snapshot.paramMap.get('token'));
      this.notFound = !this.tab;
      if (this.tab) {
        this.months = this.byMonth();
      }
    } catch {
      this.notFound = true;
    } finally {
      this.loading = false;
    }
  }

  get recent() {
    return this.tab.purchases.slice(0, 50);
  }

  private byMonth(): MonthRow[] {
    const now = new Date();
    const rows: MonthRow[] = Array.from({length: 6}, (_, i) => ({label: new Date(now.getFullYear(), now.getMonth() - i, 1), kr: 0, count: 0}));
    for (const p of this.tab.purchases) {
      const t: Date = p.timestamp?.toDate?.();
      if (!t) {
        continue;
      }
      const row = rows.find(r => r.label.getFullYear() === t.getFullYear() && r.label.getMonth() === t.getMonth());
      if (row) {
        row.kr += Number(p.price) || 0;
        row.count += Number(p.amount) || 0;
      }
    }
    return rows;
  }
}
