import {expensesTotal, splitBill, splitExpenses} from './interfaces/meal';
import {accounts} from './components/accounting/accounting';

// What Regnskab shows for a split bill: purchases of "Madklub", one per line.
function inAccounts(lines: ReturnType<typeof splitBill>) {
  return accounts(lines.map(l => ({userId: l.userId, userName: l.userId, userRoom: null, productName: 'Madklub', amount: l.amount, price: l.price})));
}

describe('Food club: splitting the bill', () => {
  it('gives every eater an equal share and the cook the bill back, adding up to 0 kr.', () => {
    const lines = splitBill(240, ['cook', 'b', 'c', 'd'], 'cook');
    expect(lines).toEqual([
      {userId: 'cook', amount: 1, price: -180},
      {userId: 'b', amount: 1, price: 60},
      {userId: 'c', amount: 1, price: 60},
      {userId: 'd', amount: 1, price: 60},
    ]);
    const a = inAccounts(lines);
    expect(a.sums.total).toBe(0);
    expect(a.sums.units.Madklub).toBe(4);
  });

  it('spreads the øre that do not divide over the first eaters', () => {
    const lines = splitBill(100, ['a', 'b', 'c'], 'a');
    expect(lines.map(l => l.price)).toEqual([-66.66, 33.33, 33.33]);
    expect(Math.round(lines.reduce((n, l) => n + l.price, 0) * 100)).toBe(0);
  });

  it('pays back someone who paid but did not eat, without a portion', () => {
    const lines = splitBill(90, ['a', 'b', 'c'], 'shopper');
    expect(lines).toContainEqual({userId: 'shopper', amount: 0, price: -90});
    const a = inAccounts(lines);
    expect(a.sums.total).toBe(0);
    expect(a.sums.units.Madklub).toBe(3);
    expect(a.rows.find(r => r.userId === 'shopper')?.total).toBe(-90);
  });

  it('pays back several payers what each spent, one of them not eating', () => {
    // The cook bought food for 200, a friend wine for 60 and did not eat, the cook added 40 more later.
    const lines = splitExpenses([{by: 'cook', kr: 200}, {by: 'friend', kr: 60}, {by: 'cook', kr: 40}], ['cook', 'b', 'c', 'd']);
    expect(lines).toEqual([
      {userId: 'cook', amount: 1, price: -165},
      {userId: 'b', amount: 1, price: 75},
      {userId: 'c', amount: 1, price: 75},
      {userId: 'd', amount: 1, price: 75},
      {userId: 'friend', amount: 0, price: -60},
    ]);
    expect(inAccounts(lines).sums.total).toBe(0);
    expect(expensesTotal({expenses: [{kr: 19.99}, {kr: 0.01}, {kr: 100.1}] as never})).toBe(120.1);
  });

  it('keeps every share in whole øre for awkward amounts', () => {
    for (const total of [1, 7.77, 99.99, 345.5, 1234.56]) {
      for (let n = 1; n <= 13; n++) {
        const eaters = Array.from({length: n}, (_, i) => `e${i}`);
        const lines = splitBill(total, eaters, 'e0');
        expect(lines.every(l => Math.abs(l.price * 100 - Math.round(l.price * 100)) < 1e-6)).toBe(true);
        expect(Math.abs(Math.round(lines.reduce((s, l) => s + l.price, 0) * 100))).toBe(0);
      }
    }
  });
});
