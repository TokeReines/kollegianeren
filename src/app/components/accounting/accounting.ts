import {Timestamp} from 'firebase/firestore';
import {Purchase} from '../../interfaces/purchase';
import {dayName} from '../stats/stats';

export interface AccountRow {
  userId: string;
  name: string;
  room: string;
  // Kroner for the period.
  total: number;
  // Per product name: units bought, and kroner.
  units: Record<string, number>;
  kr: Record<string, number>;
}

export interface Accounts {
  rows: AccountRow[];
  // Product names that were bought in the period, alphabetically.
  products: string[];
  // Column sums for the totals row.
  sums: {units: Record<string, number>, kr: Record<string, number>, total: number, allUnits: number, purchases: number};
}

// A purchase, or several of one product by one resident added up (`n` purchases, from the summary).
export type Bought = Pick<Purchase, 'userId' | 'userName' | 'userRoom' | 'productName' | 'amount' | 'price'> & {n?: number};

// To the øre, half up. Prices that are not whole øre (85 kr. a crate of 24) can make a sum land
// exactly on half an øre, and adding in another order puts it a hair either side of it: the
// tolerance, far below any real difference, rounds both the same way.
const round = (n: number) => Math.round(n * 100 + 1e-4) / 100;

// Who bought how much of what: one row per resident, one column per product, and a total.
export function accounts(purchases: Bought[]): Accounts {
  const byUser = new Map<string, AccountRow>();
  const products = new Set<string>();
  const sums: Accounts['sums'] = {units: {}, kr: {}, total: 0, allUnits: 0, purchases: 0};
  for (const p of purchases) {
    sums.purchases += p.n ?? 1;
    const row = byUser.get(p.userId) ?? {userId: p.userId, name: p.userName, room: p.userRoom == null ? '' : String(p.userRoom), total: 0, units: {}, kr: {}};
    const amount = Number(p.amount) || 0, price = Number(p.price) || 0;
    row.units[p.productName] = (row.units[p.productName] ?? 0) + amount;
    row.kr[p.productName] = (row.kr[p.productName] ?? 0) + price;
    row.total += price;
    sums.units[p.productName] = (sums.units[p.productName] ?? 0) + amount;
    sums.kr[p.productName] = (sums.kr[p.productName] ?? 0) + price;
    sums.total += price;
    sums.allUnits += amount;
    byUser.set(p.userId, row);
    products.add(p.productName);
  }
  const rows = [...byUser.values()].map(r => ({
    ...r, total: round(r.total), kr: Object.fromEntries(Object.entries(r.kr).map(([k, v]) => [k, round(v)])),
  }));
  sums.total = round(sums.total);
  sums.kr = Object.fromEntries(Object.entries(sums.kr).map(([k, v]) => [k, round(v)]));
  return {rows, products: [...products].sort((a, b) => a.localeCompare(b, 'da')), sums};
}

// Regnskab's nightly summary (ops/lib/accounts-summary.js), kitchens/{kid}/summaries/accounts-YYYY-MM:
// per Danish day ("2026-10-01") and resident id, the name and room on their first purchase that
// day and per product name [units, kroner, purchases]. Complete from the day `since`, up to and
// including the purchase at `through`; purchases taken back up to `removedThrough` are left out.
export interface AccountsMonth {
  days: Record<string, Record<string, {n: string | null, r: string, p: Record<string, [number, number, number]>}>>;
  since: string;
  through: Timestamp;
  removedThrough: Timestamp;
}

// A purchase taken back, as the app notes it in kitchens/{kid}/removed/{purchaseId}.
export interface Removed {
  userId: string;
  productName: string | null;
  amount: number;
  price: number | null;
  timestamp: Timestamp;
  removedAt: Timestamp;
}

// The months ("2026-10") a period touches.
export function monthsOf(from: Date, to: Date): string[] {
  const months: string[] = [];
  for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.push(dayName(d).slice(0, 7));
  }
  return months;
}

// The period from the summary's days, less what was taken back since the summary was made, plus
// the purchases after `through`: the same accounts as from every purchase in the period.
// Timestamps compare by valueOf(), which keeps Firestore's microseconds.
export function fromSummary(months: AccountsMonth[], from: Date, to: Date, after: Bought[], removed: Removed[]): Bought[] {
  const first = dayName(from), last = dayName(to);
  const {through, removedThrough} = months[0];
  const lines = new Map<string, Bought & {n: number}>();
  for (const m of months) {
    for (const day of Object.keys(m.days).sort()) {
      if (day < first || day > last) {
        continue;
      }
      for (const [userId, u] of Object.entries(m.days[day])) {
        for (const [productName, [units, kr, n]] of Object.entries(u.p)) {
          const key = `${userId}\n${productName}`;
          const line = lines.get(key) ?? {userId, userName: u.n ?? '', userRoom: u.r, productName, amount: 0, price: 0, n: 0};
          line.amount += units;
          line.price += kr;
          line.n += n;
          lines.set(key, line);
        }
      }
    }
  }
  for (const r of removed) {
    const day = dayName(r.timestamp.toDate());
    if (r.timestamp.valueOf() > through.valueOf() || r.removedAt.valueOf() <= removedThrough.valueOf() || day < first || day > last) {
      continue;
    }
    const line = lines.get(`${r.userId}\n${r.productName}`);
    if (line) {
      line.amount -= Number(r.amount) || 0;
      line.price -= Number(r.price) || 0;
      line.n--;
    }
  }
  return [...[...lines.values()].filter(l => l.n > 0), ...after];
}

export type Period = 'thisMonth' | 'lastMonth' | 'last30' | 'thisYear';

// The first and last day of a named period.
export function periodRange(period: Period, now = new Date()): {from: Date, to: Date} {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  switch (period) {
    case 'thisMonth': return {from: new Date(y, m, 1), to: new Date(y, m, d)};
    case 'lastMonth': return {from: new Date(y, m - 1, 1), to: new Date(y, m, 0)};
    case 'last30': return {from: new Date(y, m, d - 29), to: new Date(y, m, d)};
    case 'thisYear': return {from: new Date(y, 0, 1), to: new Date(y, m, d)};
  }
}

export interface Table {
  header: string[];
  rows: (string | number | null)[][];
  footer: (string | number | null)[];
}

// The accounts as a plain table: counts or kroner per product, then the total in kroner.
export function toTable(a: Accounts, show: 'units' | 'kr', labels: {name: string, room: string, total: string, sum: string}): Table {
  const cell = (values: Record<string, number>, p: string) => values[p] ?? null;
  return {
    header: [labels.name, labels.room, ...a.products, labels.total],
    rows: a.rows.map(r => [r.name, r.room, ...a.products.map(p => cell(show === 'units' ? r.units : r.kr, p)), r.total]),
    footer: [labels.sum, '', ...a.products.map(p => cell(show === 'units' ? a.sums.units : a.sums.kr, p)), a.sums.total],
  };
}

// CSV the way Danish Excel opens it: semicolons, decimal commas, UTF-8 with a byte order mark.
export function toCsv(t: Table): string {
  const field = (v: string | number | null) => {
    if (v === null) {
      return '';
    }
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [t.header, ...t.rows, t.footer].map(row => row.map(field).join(';')).join('\r\n') + '\r\n';
}
