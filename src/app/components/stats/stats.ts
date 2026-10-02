import {Timestamp} from 'firebase/firestore';
import {Purchase} from '../../interfaces/purchase';

export interface ProductRow { name: string; kr: number; units: number; }
export interface DayRow { date: Date; kr: number; purchases: number; }

export interface Stats {
  totals: {kr: number, purchases: number, units: number, buyers: number, profit: number | null};
  // Top 10 by revenue.
  products: ProductRow[];
  // One row per day of the period, empty days included.
  daily: DayRow[];
  // heat[weekday 0 = Monday][hour] = purchases
  heat: number[][];
  // Four thresholds splitting the non-empty heat cells into five levels.
  heatSteps: number[];
}

// Midnight at the start of a period of `days` days that ends today.
export function periodStart(days: number, now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

// A day of a kitchen's purchases, summarised by ops/stats-summary.js from the nightly backup
// (kitchens/{kid}/summaries/stats): revenue, purchases, units, per product ("productId|name":
// [kr, units]), per hour (purchases) and the buyers.
export interface DaySummary {
  kr: number;
  n: number;
  u: number;
  p: Record<string, [number, number]>;
  h: Record<string, number>;
  b: string[];
}

export interface StatsSummary {
  // Danish days ("2026-10-01"); complete from `since`, up to and including the purchase at `through`.
  days: Record<string, DaySummary>;
  since: string;
  through: Timestamp;
}

// A local day as the summary names it.
export function dayName(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Bought = Pick<Purchase, 'timestamp' | 'price' | 'amount' | 'userId' | 'productId' | 'productName'>;

// The running totals the statistics are made of, filled from purchases, summarised days, or both.
class Tally {
  private readonly byProduct = new Map<string, ProductRow>();
  private readonly byDay = new Map<string, DayRow>();
  private readonly buyers = new Set<string>();
  private readonly heat = Array.from({length: 7}, () => new Array<number>(24).fill(0));
  private kr = 0;
  private purchases = 0;
  private units = 0;
  private profit = 0;
  private costed = 0;

  constructor(private readonly from: Date, days: number, private readonly cost: Map<string, number>) {
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
      this.byDay.set(dayName(d), {date: d, kr: 0, purchases: 0});
    }
  }

  private product(productId: string, name: string, kr: number, units: number) {
    const unitCost = this.cost.get(productId);
    if (unitCost !== undefined) {
      this.profit += kr - unitCost * units;
      this.costed++;
    }
    const row = this.byProduct.get(name) ?? {name, kr: 0, units: 0};
    row.kr += kr;
    row.units += units;
    this.byProduct.set(name, row);
  }

  add(p: Bought) {
    const t = p.timestamp?.toDate?.();
    if (!t) {
      return;
    }
    const price = Number(p.price) || 0;
    const amount = Number(p.amount) || 0;
    this.kr += price;
    this.purchases++;
    this.units += amount;
    this.buyers.add(p.userId);
    this.product(p.productId, p.productName, price, amount);
    const day = this.byDay.get(dayName(t));
    if (day) {
      day.kr += price;
      day.purchases++;
    }
    this.heat[(t.getDay() + 6) % 7][t.getHours()]++;
  }

  // A summarised day; days outside the period are left out.
  addDay(name: string, d: DaySummary) {
    const day = this.byDay.get(name);
    if (!day) {
      return;
    }
    day.kr += d.kr;
    day.purchases += d.n;
    this.kr += d.kr;
    this.purchases += d.n;
    this.units += d.u;
    d.b.forEach(b => this.buyers.add(b));
    for (const [key, [kr, units]] of Object.entries(d.p)) {
      const bar = key.indexOf('|');
      this.product(key.slice(0, bar), key.slice(bar + 1), kr, units);
    }
    const weekday = (day.date.getDay() + 6) % 7;
    for (const [hour, n] of Object.entries(d.h)) {
      this.heat[weekday][+hour] += n;
    }
  }

  stats(): Stats {
    // Split at the quintiles of the non-empty cells, so a few busy hours don't wash out the rest.
    const counts = this.heat.flat().filter(c => c > 0).sort((a, b) => a - b);
    const q = (f: number) => counts.length ? counts[Math.min(counts.length - 1, Math.floor(f * counts.length))] : 0;
    return {
      totals: {kr: this.kr, purchases: this.purchases, units: this.units, buyers: this.buyers.size, profit: this.costed ? this.profit : null},
      products: [...this.byProduct.values()].sort((a, b) => b.kr - a.kr).slice(0, 10),
      daily: [...this.byDay.values()],
      heat: this.heat,
      heatSteps: [q(.2), q(.4), q(.6), q(.8)],
    };
  }
}

// `cost` is the current cost price per product id, for the estimated profit.
export function computeStats(purchases: Bought[], from: Date, days: number, cost: Map<string, number>): Stats {
  const tally = new Tally(from, days, cost);
  purchases.forEach(p => tally.add(p));
  return tally.stats();
}

// The same from a summary (up to its `through`) and the purchases after it.
export function computeStatsFrom(summary: StatsSummary, after: Bought[], from: Date, days: number, cost: Map<string, number>): Stats {
  const tally = new Tally(from, days, cost);
  for (const [name, d] of Object.entries(summary.days)) {
    tally.addDay(name, d);
  }
  after.forEach(p => tally.add(p));
  return tally.stats();
}

// 0-4 for a heat cell, -1 when empty.
export function heatLevel(count: number, steps: number[]): number {
  return count ? steps.filter(s => count > s).length : -1;
}
