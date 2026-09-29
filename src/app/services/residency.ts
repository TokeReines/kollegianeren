import {Purchase} from '../interfaces/purchase';
import {User} from '../interfaces/user';
import {millis} from '../time';

// How long moved-out residents keep their name on purchases before the app offers to anonymise them.
export const RETENTION_MONTHS = 12;
export const ANONYMOUS_NAME = 'Tidligere beboer';

export interface ResidentSummary {
  last12Months: number;
  thisMonth: number;
  purchases: number;
}

export function summarise(purchases: Pick<Purchase, 'price' | 'timestamp'>[], now = new Date()): ResidentSummary {
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let last12Months = 0, thisMonth = 0;
  for (const p of purchases) {
    const t = millis(p.timestamp);
    const price = Number(p.price) || 0;
    if (t >= yearAgo) {
      last12Months += price;
    }
    if (t >= monthStart) {
      thisMonth += price;
    }
  }
  return {last12Months, thisMonth, purchases: purchases.length};
}

export function isDueForAnonymising(user: User, now = Date.now()): boolean {
  const out = millis(user.movedOutAt);
  if (!out || user.anonymisedAt) {
    return false;
  }
  const due = new Date(out);
  due.setMonth(due.getMonth() + RETENTION_MONTHS);
  return now >= due.getTime();
}

export interface MonthRow { label: Date; kr: number; count: number; }

// This month and the five before it, newest first.
export function byMonth(purchases: Pick<Purchase, 'timestamp' | 'price' | 'amount'>[], now = new Date()): MonthRow[] {
  const rows: MonthRow[] = Array.from({length: 6}, (_, i) => ({label: new Date(now.getFullYear(), now.getMonth() - i, 1), kr: 0, count: 0}));
  for (const p of purchases) {
    const t = p.timestamp?.toDate?.();
    const row = t && rows.find(r => r.label.getFullYear() === t.getFullYear() && r.label.getMonth() === t.getMonth());
    if (row) {
      row.kr += Number(p.price) || 0;
      row.count += Number(p.amount) || 0;
    }
  }
  return rows;
}
