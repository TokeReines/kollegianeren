import {Purchase} from '../../interfaces/purchase';

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

type Bought = Pick<Purchase, 'userId' | 'userName' | 'userRoom' | 'productName' | 'amount' | 'price'>;

const round = (n: number) => Math.round(n * 100) / 100;

// Who bought how much of what: one row per resident, one column per product, and a total.
export function accounts(purchases: Bought[]): Accounts {
  const byUser = new Map<string, AccountRow>();
  const products = new Set<string>();
  const sums: Accounts['sums'] = {units: {}, kr: {}, total: 0, allUnits: 0, purchases: purchases.length};
  for (const p of purchases) {
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
