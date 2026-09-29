import {Purchase} from '../../interfaces/purchase';

export interface AccountRow {
  userId: string;
  name: string;
  room: string;
  total: number;
  // Units bought, per product name.
  units: Record<string, number>;
}

export interface Accounts {
  rows: AccountRow[];
  // Product names that were bought in the period, alphabetically.
  products: string[];
}

// Who bought how much of what: one row per resident, one column per product, and a total.
export function accounts(purchases: Pick<Purchase, 'userId' | 'userName' | 'userRoom' | 'productName' | 'amount' | 'price'>[]): Accounts {
  const byUser = new Map<string, AccountRow>();
  const products = new Set<string>();
  for (const p of purchases) {
    const row = byUser.get(p.userId) ?? {userId: p.userId, name: p.userName, room: p.userRoom ?? '', total: 0, units: {}};
    row.units[p.productName] = (row.units[p.productName] ?? 0) + (Number(p.amount) || 0);
    row.total += Number(p.price) || 0;
    byUser.set(p.userId, row);
    products.add(p.productName);
  }
  const rows = [...byUser.values()].map(r => ({...r, total: Math.round(r.total * 100) / 100}));
  return {rows, products: [...products].sort((a, b) => a.localeCompare(b, 'da'))};
}
