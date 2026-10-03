import {Timestamp} from 'firebase/firestore';
import {millis} from '../time';

// adminStats/latest, written once a day by ops/admin-stats.js: how each kitchen uses the app, as
// numbers. No residents' names and nothing per resident.
export interface AdminStats {
  at: Timestamp;
  // Firestore use per quota day (Pacific time), oldest first.
  usage: {day: string, reads: number, writes: number, deletes: number}[];
  // The deployed build (main bundle hash); null when the site could not be fetched.
  build?: string | null;
  kitchens: KitchenStats[];
  // What the job itself read.
  reads: number;
}

export interface KitchenStats {
  id: string;
  name: string;
  createdAt: Timestamp | null;
  // From the last purchase: the new buy page moves the sold counter, the 2019 build does not.
  app: 'new' | 'old' | null;
  // build: what the login last opened (null on the 2019 build, which does not report), and whether
  // that is the deployed one.
  logins: {role: string, created: Timestamp | null, lastActive: Timestamp | null,
    build?: string | null, loadedAt?: Timestamp | null, latest?: boolean | null}[];
  residents: {total: number, active: number, movedOut: number, anonymised: number};
  products: {name: string, price: number | null, retailPrice: number | null, stock: number | null, sold: number | null, active: boolean}[];
  purchases: {today: number, last7: number, prev7: number, last30: number, lastAt: Timestamp | null};
  meals: {eaten30: number, eaters30: number, cooks30: number, upcoming: number, lastBookedAt: Timestamp | null};
  messages: {total: number, lastAt: Timestamp | null, lastFrom: 'kitchen' | 'maker' | null};
  invites: {open: number, used: number};
  residentLinks: number;
  // What the app counted (interfaces/usage.ts); missing before the counting started.
  usage?: KitchenUsage;
}

export interface UsageCounts {
  v: Record<string, number>;
  a: Record<string, number>;
  // Documents read by "page|collection|open, live or get"; missing before the read meter.
  r?: Record<string, number>;
}

// Per kind of login (t: tablet, m: owner or treasurer) over 7 and 30 days; the 30 days' views and
// actions by hour (0 to 23), and the total of each day ("2026-10-02").
export interface KitchenUsage {
  d7: {t: UsageCounts, m: UsageCounts};
  d30: {t: UsageCounts, m: UsageCounts};
  hours: number[];
  days: Record<string, number>;
}

// Change against the week before, in whole percent; null when there is nothing to compare with.
export function trend(now: number, before: number): number | null {
  return before ? Math.round((now - before) / before * 100) : null;
}

// The latest a login of the kitchen was used, or its last purchase if later.
export function lastActive(k: KitchenStats): number {
  return Math.max(0, millis(k.purchases.lastAt), ...k.logins.map(l => millis(l.lastActive)));
}

export interface AdminSummary {
  kitchens: number;
  // Bought something in the last 7 days.
  inUse: number;
  onNewApp: number;
  purchases7: number;
  purchasesTrend: number | null;
  meals30: number;
  eaters30: number;
  foodClubKitchens: number;
}

export function summarise(kitchens: KitchenStats[]): AdminSummary {
  const sum = (f: (k: KitchenStats) => number) => kitchens.reduce((n, k) => n + f(k), 0);
  const purchases7 = sum(k => k.purchases.last7);
  return {
    kitchens: kitchens.length,
    inUse: kitchens.filter(k => k.purchases.last7 > 0).length,
    onNewApp: kitchens.filter(k => k.app === 'new').length,
    purchases7,
    purchasesTrend: trend(purchases7, sum(k => k.purchases.prev7)),
    meals30: sum(k => k.meals.eaten30),
    eaters30: sum(k => k.meals.eaters30),
    foodClubKitchens: kitchens.filter(k => k.meals.eaten30 + k.meals.upcoming > 0).length,
  };
}

export type UsagePeriod = 'd7' | 'd30';
export type UsageWho = 'all' | 't' | 'm';

export interface UsageCell {
  // For the chosen logins; t and m for the tooltip.
  n: number;
  t: number;
  m: number;
  // 0 to 4 against the kitchen that uses it most, -1 when not used.
  level: number;
}

export interface UsageRow {
  key: string;
  total: number;
  cells: UsageCell[];
}

// Pages or actions (keys) by kitchen, most used first; keys nobody used go in `unused`. Keys a
// newer build counts and this one does not know are listed too, after the known ones.
export function usageGrid(kitchens: KitchenStats[], keys: readonly string[], kind: 'v' | 'a' | 'r', period: UsagePeriod,
                          who: UsageWho): {rows: UsageRow[], unused: string[]} {
  const seen = new Set(kitchens.flatMap(k => ['t', 'm'].flatMap(w => Object.keys(k.usage?.[period][w as 't' | 'm'][kind] ?? {}))));
  const all = [...keys, ...[...seen].filter(k => !keys.includes(k)).sort()];
  const rows = all.map(key => {
    const cells = kitchens.map(k => {
      const u = k.usage?.[period];
      const t = u?.t[kind]?.[key] ?? 0;
      const m = u?.m[kind]?.[key] ?? 0;
      return {t, m, n: who === 't' ? t : who === 'm' ? m : t + m, level: -1};
    });
    const max = Math.max(0, ...cells.map(c => c.n));
    for (const c of cells) {
      c.level = c.n ? Math.min(4, Math.ceil(c.n / max * 5) - 1) : -1;
    }
    return {key, total: cells.reduce((s, c) => s + c.n, 0), cells};
  });
  return {
    rows: rows.filter(r => r.total).sort((a, b) => b.total - a.total),
    unused: rows.filter(r => !r.total).map(r => r.key),
  };
}

// All kitchens' counts by hour of the day (30 days).
export function usageHours(kitchens: KitchenStats[]): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const k of kitchens) {
    k.usage?.hours.forEach((n, h) => hours[h] += n);
  }
  return hours;
}

// All kitchens' counts per day, oldest first, for the days that have any; the first is when
// counting started.
export function usageDays(kitchens: KitchenStats[]): {day: string, n: number}[] {
  const days = new Map<string, number>();
  for (const k of kitchens) {
    for (const [day, n] of Object.entries(k.usage?.days ?? {})) {
      days.set(day, (days.get(day) ?? 0) + n);
    }
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, n]) => ({day, n}));
}
