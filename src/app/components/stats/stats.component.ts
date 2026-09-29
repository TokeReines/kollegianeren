import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';
import {collection, getDocs, query, where} from 'firebase/firestore';
import {take} from 'rxjs/operators';
import {AuthService} from '../../services/auth.service';
import {TranslateService} from '../../services/translate.service';
import {Purchase} from '../../interfaces/purchase';
import {db} from '../../firebase';

interface ProductRow { name: string; kr: number; units: number; }
interface DayRow { date: Date; kr: number; purchases: number; }

const WEEKDAYS = {da: ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']};

// What the kitchen drinks and when, over a chosen period. Read once per period (not a live
// listener) to spare the daily read quota. No per-resident ranking, on purpose.
@Component({
  selector: 'app-stats',
  templateUrl: './stats.component.html',
  styleUrls: ['./stats.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class StatsComponent implements OnInit {
  days = 30;
  loading = false;
  showTable = false;
  totals = {kr: 0, purchases: 0, units: 0, buyers: 0, profit: null as number | null};
  products: ProductRow[] = [];
  maxProductKr = 1;
  daily: DayRow[] = [];
  maxDayKr = 1;
  // heat[weekday 0 = Monday][hour] = purchases
  heat: number[][] = [];
  heatSteps: number[] = [];
  tip: {text: string, x: number, y: number} | null = null;
  // Cost price per product id, for the estimated profit.
  private cost = new Map<string, number>();

  constructor(private auth: AuthService, public translate: TranslateService) {
  }

  get weekdays() {
    return WEEKDAYS[this.translate.getLanguage() === 'en' ? 'en' : 'da'];
  }

  get hours() {
    return Array.from({length: 24}, (_, h) => h);
  }

  ngOnInit() {
    this.load();
  }

  setDays(days: number) {
    this.days = days;
    this.load();
  }

  async load() {
    this.loading = true;
    try {
      const kid = await this.auth.kitchenId.pipe(take(1)).toPromise();
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      from.setDate(from.getDate() - (this.days - 1));
      const [snap, products] = await Promise.all([
        getDocs(query(collection(db, 'kitchens', kid, 'purchases'), where('timestamp', '>=', from))),
        getDocs(collection(db, 'kitchens', kid, 'products')),
      ]);
      this.cost = new Map(products.docs.filter(d => d.get('retailPrice') != null).map(d => [d.id, Number(d.get('retailPrice'))]));
      this.compute(snap.docs.map(d => d.data() as Purchase), from);
    } finally {
      this.loading = false;
    }
  }

  private compute(purchases: Purchase[], from: Date) {
    const byProduct = new Map<string, ProductRow>();
    const byDay = new Map<string, DayRow>();
    const buyers = new Set<string>();
    const heat = Array.from({length: 7}, () => new Array(24).fill(0));
    for (let i = 0; i < this.days; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      byDay.set(d.toDateString(), {date: d, kr: 0, purchases: 0});
    }
    let kr = 0, units = 0, profit = 0, costed = 0;
    for (const p of purchases) {
      const t: Date = p.timestamp?.toDate?.();
      if (!t) {
        continue;
      }
      const price = Number(p.price) || 0;
      const amount = Number(p.amount) || 0;
      kr += price;
      units += amount;
      buyers.add(p.userId);
      if (this.cost.has(p.productId)) {
        profit += price - this.cost.get(p.productId) * amount;
        costed++;
      }
      const row = byProduct.get(p.productName) || {name: p.productName, kr: 0, units: 0};
      row.kr += price;
      row.units += amount;
      byProduct.set(p.productName, row);
      const day = byDay.get(t.toDateString());
      if (day) {
        day.kr += price;
        day.purchases++;
      }
      heat[(t.getDay() + 6) % 7][t.getHours()]++;
    }
    this.totals = {kr, purchases: purchases.length, units, buyers: buyers.size, profit: costed ? profit : null};
    this.products = [...byProduct.values()].sort((a, b) => b.kr - a.kr).slice(0, 10);
    this.maxProductKr = Math.max(1, ...this.products.map(p => p.kr));
    this.daily = [...byDay.values()];
    this.maxDayKr = Math.max(1, ...this.daily.map(d => d.kr));
    this.heat = heat;
    // Five steps split at the quartiles of the non-empty cells, so a few busy hours don't wash out the rest.
    const counts = heat.flat().filter(c => c > 0).sort((a, b) => a - b);
    const q = (f: number) => counts.length ? counts[Math.min(counts.length - 1, Math.floor(f * counts.length))] : 0;
    this.heatSteps = [q(.2), q(.4), q(.6), q(.8)];
  }

  level(count: number): number {
    if (!count) {
      return -1;
    }
    return this.heatSteps.filter(s => count > s).length;
  }

  private t(key: string) {
    return this.translate.data[key] || key;
  }

  private kr(n: number) {
    return new Intl.NumberFormat('da-DK', {maximumFractionDigits: 2}).format(n) + ' kr.';
  }

  tipProduct(p: ProductRow) {
    return `${p.name}: ${this.kr(p.kr)}, ${p.units} ${this.t('PIECES')}`;
  }

  tipDay(d: DayRow) {
    const day = new Intl.DateTimeFormat('da-DK', {weekday: 'short', day: 'numeric', month: 'short'}).format(d.date);
    return `${day}: ${this.kr(d.kr)}, ${d.purchases} ${this.t('STATS_PURCHASES').toLowerCase()}`;
  }

  tipCell(weekday: number, hour: number, count: number) {
    return `${this.weekdays[weekday]} ${hour}-${hour + 1}: ${count} ${this.t('STATS_PURCHASES').toLowerCase()}`;
  }

  show(event: MouseEvent, text: string) {
    const host = (event.currentTarget as HTMLElement).closest('.page').getBoundingClientRect();
    this.tip = {text, x: event.clientX - host.left + 12, y: event.clientY - host.top + 12};
  }

  hide() {
    this.tip = null;
  }
}
