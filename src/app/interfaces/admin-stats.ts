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
