import {Timestamp} from 'firebase/firestore';
import {Accounts, AccountsMonth, Bought, Removed, accounts, fromSummary, monthsOf} from './components/accounting/accounting';
import {dayName} from './components/stats/stats';
// @ts-expect-error: plain JavaScript, the nightly job's own code (ops/stats-summary.js uses it).
import {summariseAccounts} from '../../ops/lib/accounts-summary.js';

// Regnskab from the nightly summary must equal Regnskab from every purchase, to the øre. A made-up
// kitchen buys for three months; the backup runs, purchases are taken back before and after it,
// and more are bought after it. Then many periods are compared both ways.

// A small deterministic random generator, so a failure can be replayed.
function random(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

interface Made extends Bought {
  id: string;
  ts: Timestamp;
}

// Prices as kitchens set them, some not in whole øre (a crate's price over its bottles).
const PRODUCTS = [['Tuborg', 7.5], ['Cocio', 12.95], ['Kildevæld', 5], ['Smirnoff', 14.125], ['Fernet', 19.99], ['Sodavand', 85 / 24]] as const;
const USERS = [['u1', 'Anna', '101'], ['u2', 'Bo', '102'], ['u3', 'Cille', null], ['u4', 'Dan', '104'], ['u5', 'Eva', '105'], ['u6', 'Finn', '106']] as const;

function kitchen(seed: number) {
  const rnd = random(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const start = new Date(2026, 6, 25).getTime();
  const backupAt = new Date(2026, 9, 3, 8, 40).getTime();
  const end = new Date(2026, 9, 4, 22, 0).getTime();
  const made: Made[] = [];
  let id = 0;
  for (let t = start; t < end; t += rnd() * 4 * 3600e3) {
    const [productName, unit] = pick(PRODUCTS);
    const amount = 1 + Math.floor(rnd() * 3);
    // A group buy: one timestamp for several residents, as one batch with serverTimestamp() gives.
    const ts = new Timestamp(Math.floor(t / 1000), Math.floor(rnd() * 1e9));
    const buyers = rnd() < 0.2 ? USERS.slice(0, 2 + Math.floor(rnd() * 3)) : [pick(USERS)];
    for (const [userId, userName, userRoom] of buyers) {
      made.push({id: `p${String(++id).padStart(5, '0')}`, ts, userId, userName, userRoom, productName, amount, price: unit * amount});
    }
  }
  // The newest purchase before the backup lands exactly at it, as a group, to test the trimmed `through`.
  const group = new Timestamp(Math.floor(backupAt / 1000) - 1, 123456789);
  for (const [userId, userName, userRoom] of USERS.slice(0, 3)) {
    made.push({id: `p${String(++id).padStart(5, '0')}`, ts: group, userId, userName, userRoom, productName: 'Tuborg', amount: 1, price: 7.5});
  }
  made.sort((a, b) => a.ts.valueOf() < b.ts.valueOf() ? -1 : a.ts.valueOf() > b.ts.valueOf() ? 1 : a.id < b.id ? -1 : 1);

  // Taken back: some before the backup read the notes, some after (and after the summary), some
  // bought after the backup. Notes before `notesRead` are in the summary's removed set.
  const notesRead = Timestamp.fromMillis(backupAt + 60e3);
  const removed: (Removed & {id: string})[] = [];
  for (const p of made) {
    if (rnd() < 0.06) {
      const afterBackup = p.ts.toMillis() > backupAt || rnd() < 0.5;
      const at = afterBackup ? Math.max(p.ts.toMillis(), backupAt) + 3600e3 + rnd() * 3600e3 : p.ts.toMillis() + rnd() * 60e3;
      removed.push({id: p.id, userId: p.userId, productName: p.productName, amount: p.amount, price: p.price, timestamp: p.ts,
        removedAt: Timestamp.fromMillis(Math.min(at, end))});
    }
  }
  const gone = new Set(removed.map(r => r.id));
  const known = new Set(removed.filter(r => r.removedAt.valueOf() <= notesRead.valueOf()).map(r => r.id));
  // The backup holds what was there when it read: not what was taken back before (a nightly
  // backup read some of those earlier, though, so half of them are in it anyway).
  const files = made.filter(p => p.ts.toMillis() <= backupAt && (!known.has(p.id) || p.id.endsWith('0') || p.id.endsWith('5')));
  const local = (ms: number) => ({day: dayName(new Date(ms))});
  const summary = summariseAccounts(
    files.map(p => ({id: p.id, ts: {s: p.ts.seconds, n: p.ts.nanoseconds}, data: p})),
    {removed: known, since: dayName(new Date(start)), today: dayName(new Date(end)), local});
  const through = new Timestamp(summary.through.s, summary.through.n);
  const months: Record<string, AccountsMonth> = Object.fromEntries(Object.entries(summary.months as Record<string, AccountsMonth['days']>)
    .map(([m, days]) => [m, {days, since: dayName(new Date(start)), through, removedThrough: notesRead}]));
  return {made, gone, removed, months, through, notesRead};
}

// The rows in a fixed order, so two computations compare.
const sorted = (a: Accounts) => ({...a, rows: [...a.rows].sort((x, y) => x.userId.localeCompare(y.userId))});

describe('Regnskab from the nightly summary', () => {
  const periods: [string, Date, Date][] = [
    ['everything', new Date(2026, 6, 25), new Date(2026, 9, 4)],
    ['a weekend', new Date(2026, 7, 14), new Date(2026, 7, 16)],
    ['one day', new Date(2026, 8, 9), new Date(2026, 8, 9)],
    ['last month', new Date(2026, 8, 1), new Date(2026, 8, 30)],
    ['this month', new Date(2026, 9, 1), new Date(2026, 9, 4)],
    ['last 30 days', new Date(2026, 8, 5), new Date(2026, 9, 4)],
    ['across a month end', new Date(2026, 7, 28), new Date(2026, 8, 3)],
    ['the backup day', new Date(2026, 9, 3), new Date(2026, 9, 3)],
    ['after the backup', new Date(2026, 9, 4), new Date(2026, 9, 4)],
  ];
  for (const seed of [1, 2, 3, 42, 2026, ...Array.from({length: 15}, (_, i) => 101 + i * 37)]) {
    const k = kitchen(seed);
    for (const [name, from, to] of periods) {
      it(`${name} (seed ${seed})`, () => {
        const start = from.getTime(), end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).getTime();
        const inPeriod = (p: Made) => p.ts.toMillis() >= start && p.ts.toMillis() < end;
        const truth = accounts(k.made.filter(p => !k.gone.has(p.id) && inPeriod(p)));
        // What the app reads: the months, the purchases after `through` still there, the notes after the summary's.
        const after = k.made.filter(p => !k.gone.has(p.id) && inPeriod(p) && p.ts.valueOf() > k.through.valueOf());
        const notes = k.removed.filter(r => r.removedAt.valueOf() > k.notesRead.valueOf());
        const lines = fromSummary(monthsOf(from, to).map(m => k.months[m]), from, to, after, notes);
        expect(sorted(accounts(lines))).toEqual(sorted(truth));
        expect(truth.sums.purchases).toBeGreaterThan(0);
      });
    }
  }

  it('would be wrong without the notes of what was taken back, or with the live purchases twice', () => {
    const k = kitchen(42);
    const from = new Date(2026, 6, 25), to = new Date(2026, 9, 4);
    const truth = sorted(accounts(k.made.filter(p => !k.gone.has(p.id))));
    const after = k.made.filter(p => !k.gone.has(p.id) && p.ts.valueOf() > k.through.valueOf());
    const months = monthsOf(from, to).map(m => k.months[m]);
    expect(sorted(accounts(fromSummary(months, from, to, after, [])))).not.toEqual(truth);
    const fromBackupDay = k.made.filter(p => !k.gone.has(p.id) && p.ts.toMillis() >= new Date(2026, 9, 3).getTime());
    expect(sorted(accounts(fromSummary(months, from, to, fromBackupDay, k.removed)))).not.toEqual(truth);
  });

  it('reads the last moment before the backup live, not from the summary', () => {
    const k = kitchen(7);
    const newest = k.made.filter(p => p.ts.toMillis() <= new Date(2026, 9, 3, 8, 40).getTime()).pop()!;
    expect(k.through.valueOf() < newest.ts.valueOf()).toBe(true);
  });
});
