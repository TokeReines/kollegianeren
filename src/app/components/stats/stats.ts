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

// `cost` is the current cost price per product id, for the estimated profit.
export function computeStats(purchases: Pick<Purchase, 'timestamp' | 'price' | 'amount' | 'userId' | 'productId' | 'productName'>[],
                             from: Date, days: number, cost: Map<string, number>): Stats {
  const byProduct = new Map<string, ProductRow>();
  const byDay = new Map<string, DayRow>();
  const buyers = new Set<string>();
  const heat = Array.from({length: 7}, () => new Array<number>(24).fill(0));
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    byDay.set(d.toDateString(), {date: d, kr: 0, purchases: 0});
  }
  let kr = 0, units = 0, profit = 0, costed = 0;
  for (const p of purchases) {
    const t = p.timestamp?.toDate?.();
    if (!t) {
      continue;
    }
    const price = Number(p.price) || 0;
    const amount = Number(p.amount) || 0;
    kr += price;
    units += amount;
    buyers.add(p.userId);
    const unitCost = cost.get(p.productId);
    if (unitCost !== undefined) {
      profit += price - unitCost * amount;
      costed++;
    }
    const row = byProduct.get(p.productName) ?? {name: p.productName, kr: 0, units: 0};
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
  // Split at the quintiles of the non-empty cells, so a few busy hours don't wash out the rest.
  const counts = heat.flat().filter(c => c > 0).sort((a, b) => a - b);
  const q = (f: number) => counts.length ? counts[Math.min(counts.length - 1, Math.floor(f * counts.length))] : 0;
  return {
    totals: {kr, purchases: purchases.length, units, buyers: buyers.size, profit: costed ? profit : null},
    products: [...byProduct.values()].sort((a, b) => b.kr - a.kr).slice(0, 10),
    daily: [...byDay.values()],
    heat,
    heatSteps: [q(.2), q(.4), q(.6), q(.8)],
  };
}

// 0-4 for a heat cell, -1 when empty.
export function heatLevel(count: number, steps: number[]): number {
  return count ? steps.filter(s => count > s).length : -1;
}
