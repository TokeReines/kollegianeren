import {Timestamp} from 'firebase/firestore';
import {DaySummary, StatsSummary, computeStats, computeStatsFrom, dayName, periodStart} from './components/stats/stats';

// What ops/stats-summary.js writes, made the same way (in the test's own time zone).
function summarise(purchases: {timestamp: Timestamp, price: number, amount: number, userId: string, productId: string, productName: string}[],
                   since: string): StatsSummary {
  const days: Record<string, DaySummary> = {};
  let through = 0;
  for (const p of purchases) {
    const t = p.timestamp.toDate();
    through = Math.max(through, t.getTime());
    const day = dayName(t);
    if (day < since) {
      continue;
    }
    const d = days[day] ??= {kr: 0, n: 0, u: 0, p: {}, h: {}, b: []};
    d.kr += p.price;
    d.n++;
    d.u += p.amount;
    const row = d.p[`${p.productId}|${p.productName}`] ??= [0, 0];
    row[0] += p.price;
    row[1] += p.amount;
    d.h[t.getHours()] = (d.h[t.getHours()] ?? 0) + 1;
    if (!d.b.includes(p.userId)) {
      d.b.push(p.userId);
    }
  }
  return {days, since, through: Timestamp.fromMillis(through)};
}

describe('Statistik from the nightly summary', () => {
  // 100 days of purchases, a few a day, at odd hours, by four residents, three products.
  const now = new Date();
  const purchases = Array.from({length: 600}, (_, i) => {
    const at = new Date(now.getTime() - (i * 4.1 + 0.3) * 3600e3);
    return {timestamp: Timestamp.fromDate(at), price: 6 + (i % 3) * 3, amount: 1 + (i % 2), userId: `u${i % 4}`,
      productId: `p${i % 3}`, productName: ['Øl', 'Cola', 'Vand'][i % 3]};
  });
  const cost = new Map([['p0', 4], ['p1', 3]]);
  const cutoff = now.getTime() - 20 * 3600e3;
  const before = purchases.filter(p => p.timestamp.toMillis() <= cutoff);
  const after = purchases.filter(p => p.timestamp.toMillis() > cutoff);

  for (const days of [7, 30, 90]) {
    it(`gives the same as every purchase, for ${days} days`, () => {
      const from = periodStart(days);
      const all = computeStats(purchases.filter(p => p.timestamp.toMillis() >= from.getTime()), from, days, cost);
      const summary = summarise(before, dayName(periodStart(92)));
      const fromSummary = computeStatsFrom(summary, after, from, days, cost);
      expect(fromSummary.totals.purchases).toBe(all.totals.purchases);
      expect(fromSummary.totals.kr).toBeCloseTo(all.totals.kr, 6);
      expect(fromSummary.totals.units).toBe(all.totals.units);
      expect(fromSummary.totals.buyers).toBe(all.totals.buyers);
      expect(fromSummary.totals.profit).toBeCloseTo(all.totals.profit!, 6);
      expect(fromSummary.products).toEqual(all.products);
      expect(fromSummary.daily).toEqual(all.daily);
      expect(fromSummary.heat).toEqual(all.heat);
      expect(fromSummary.heatSteps).toEqual(all.heatSteps);
    });
  }
});
