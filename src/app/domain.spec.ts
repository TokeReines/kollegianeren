import {Timestamp} from 'firebase/firestore';
import {accounts, periodRange, toCsv, toTable} from './components/accounting/accounting';
import {computeStats, heatLevel, periodStart} from './components/stats/stats';
import {initials, tone} from './components/shared/resident-avatar.component';
import {kitchenKey} from './interfaces/kitchen';
import {inviteLink, isOpen, newCode} from './interfaces/invite';
import {toThreads} from './interfaces/message';
import {byName, isLowStock, margin, tracksStock} from './interfaces/product';
import {byRoom} from './interfaces/user';
import {computeFoodStats, forResident} from './components/stats/food-stats';
import {Meal, MealTag, atTime, closeHours, dayKey, isoWeek, newMeal, signupOpen, weekDays, weekStart} from './interfaces/meal';
import {byMonth, isDueForAnonymising, summarise} from './services/residency';
import {sortValue} from './table-sort';
import {describeSale, joinNames, productOrder} from './components/buy-page/basket';
import {kr} from './format';
import {millis} from './time';

const at = (y: number, m: number, d: number, h = 20) => Timestamp.fromDate(new Date(y, m - 1, d, h));

const product = {id: 'p', name: 'Tuborg', price: 7, retailPrice: 4.9, image: '', clId: '', active: true};

describe('products', () => {
  it('margin is sale price minus cost, null without a cost', () => {
    expect(margin(product)).toBeCloseTo(2.1);
    expect(margin({...product, retailPrice: null})).toBeNull();
  });

  it('stock is tracked only when it is a number, and low at 5 or below by default', () => {
    expect(tracksStock(product)).toBe(false);
    expect(isLowStock({...product, stock: 5})).toBe(true);
    expect(isLowStock({...product, stock: 6})).toBe(false);
    expect(isLowStock({...product, stock: 6, lowStock: 10})).toBe(true);
    expect(isLowStock({...product, stock: null})).toBe(false);
  });

  it('sorts names the Danish way', () => {
    expect(['Øl', 'Cola', 'Æble'].map(name => ({name})).sort(byName).map(p => p.name)).toEqual(['Cola', 'Æble', 'Øl']);
  });
});

describe('food club', () => {
  const dinner = at(2026, 10, 2, 18);
  const meal = (hoursBefore: number, askCook = false) => ({date: dinner, closesAt: Timestamp.fromMillis(dinner.toMillis() - hoursBefore * 3.6e6), askCook});

  it('sign-up is open until it closes, and never when people ask the cook', () => {
    const dayBefore = at(2026, 10, 1, 17).toMillis();
    expect(signupOpen(meal(24), dayBefore)).toBe(true);
    expect(signupOpen(meal(24), at(2026, 10, 1, 18).toMillis())).toBe(false);
    expect(signupOpen(meal(24, true), dayBefore)).toBe(false);
  });

  it('finds the closing choice a meal was made with', () => {
    expect(closeHours(meal(48))).toBe(48);
    expect(closeHours(meal(0))).toBe(0);
    expect(closeHours(meal(11))).toBe(12);
  });

  it('books a day with only the cook, closing 24 hours before 18:30', () => {
    const m = newMeal(new Date(2026, 9, 2, 11), 'u1');
    expect(m.date.toDate()).toEqual(new Date(2026, 9, 2, 18, 30));
    expect(closeHours(m)).toBe(24);
    expect(m.menu).toBe('');
  });

  it('pages by week, Monday to Sunday, days before today as history', () => {
    const today = new Date(2026, 8, 30, 11); // a Wednesday
    expect(weekStart(today)).toEqual(new Date(2026, 8, 28));
    expect(weekStart(today, 1)).toEqual(new Date(2026, 9, 5));
    expect(weekStart(new Date(2026, 9, 4))).toEqual(new Date(2026, 8, 28)); // Sunday
    const friday = {date: at(2026, 10, 2, 18), menu: 'y'} as Meal;
    const days = weekDays([friday], weekStart(today), today);
    expect(days.map(d => d.day.getDate())).toEqual([28, 29, 30, 1, 2, 3, 4]);
    expect(days.map(d => d.meals.length)).toEqual([0, 0, 0, 0, 1, 0, 0]);
    expect(days.map(d => d.past)).toEqual([true, true, false, false, false, false, false]);
    expect(weekDays([], weekStart(today, -1), today).every(d => d.past)).toBe(true);
  });

  it('keys a meal by its local day, one meal a day', () => {
    expect(dayKey(new Date(2026, 9, 1, 23, 30))).toBe('2026-10-01');
    expect(dayKey(new Date(2026, 11, 31, 0, 5))).toBe('2026-12-31');
  });

  it('counts eaten meals per day, weekday, tag and resident', () => {
    const m = (d: number, cooks: string[], signups: string[], tags: MealTag[] = []) => ({date: at(2026, 9, d, 18), cooks, signups, tags});
    const from = new Date(2026, 8, 21);
    const s = computeFoodStats([
      m(22, ['a'], ['a', 'b', 'c'], ['vegan']),
      m(24, ['a', 'b'], ['a', 'b', 'c', 'd', 'e'], ['vegan', 'glutenFree']),
      m(29, ['c'], ['c']), // not eaten yet
    ], from, 7, at(2026, 9, 27, 12).toMillis());
    expect(s.totals).toEqual({meals: 2, eaters: 8, perMeal: 4, cooks: 2, dayShare: 2 / 7});
    expect(s.daily.map(d => d.eaters)).toEqual([0, 3, 0, 5, 0, 0, 0]);
    expect(s.weekdays[1]).toEqual({weekday: 1, meals: 1, eaters: 3}); // Tuesday
    expect(s.tags).toEqual([{tag: 'vegan', meals: 2}, {tag: 'glutenFree', meals: 1}]);
    expect(s.people['a']).toEqual({ate: 2, cooked: 2, guests: 8});
    expect(s.people['b']).toEqual({ate: 2, cooked: 1, guests: 5}); // shared the second one
    expect(s.people['c']).toEqual({ate: 2, cooked: 0, guests: 0}); // their own food club is still to come
    expect(s.people['e']).toEqual({ate: 1, cooked: 0, guests: 0});
    // One resident: only the food clubs they ate at or cooked.
    const meals = [m(22, ['a'], ['a', 'b', 'c']), m(24, ['b'], ['b', 'd']), m(25, ['d'], ['c', 'd'])];
    expect(forResident(meals, 'c').map(x => x.date.toDate().getDate())).toEqual([22, 25]);
    expect(forResident(meals, 'b').map(x => x.date.toDate().getDate())).toEqual([22, 24]);
  });

  it('numbers weeks as Danish calendars do', () => {
    expect(isoWeek(new Date(2026, 9, 1))).toBe(40);
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
  });

  it('puts the dinner time on the chosen day', () => {
    expect(atTime(new Date(2026, 9, 2, 0, 0), '18:30')).toEqual(new Date(2026, 9, 2, 18, 30));
  });
});

describe('residents', () => {
  it('sorts rooms as numbers', () => {
    expect(['710', '99', '701'].map(room => ({room})).sort(byRoom).map(u => u.room)).toEqual(['99', '701', '710']);
  });

  it('makes initials and a stable colour', () => {
    expect(initials('Anna Holm')).toBe('AH');
    expect(initials('Beboer 230')).toBe('B2');
    expect(initials('bo')).toBe('B');
    expect(tone('Anna Holm')).toBe(tone('Anna Holm'));
    expect([0, 1, 2]).toContain(tone('x'));
  });

  it('is due for anonymising 12 months after moving out, once', () => {
    const now = new Date(2026, 8, 29).getTime();
    const user = {id: 'u', name: 'A', kitchen: 'k', room: '1', image: '', clId: '', active: false};
    expect(isDueForAnonymising({...user, movedOutAt: at(2025, 9, 28)}, now)).toBe(true);
    expect(isDueForAnonymising({...user, movedOutAt: at(2025, 10, 1)}, now)).toBe(false);
    expect(isDueForAnonymising({...user, movedOutAt: at(2025, 1, 1), anonymisedAt: at(2026, 2, 1)}, now)).toBe(false);
    expect(isDueForAnonymising(user, now)).toBe(false);
  });

  it('sums this month and the last 12 months', () => {
    const now = new Date(2026, 8, 29);
    const s = summarise([{price: 10, timestamp: at(2026, 9, 2)}, {price: 5, timestamp: at(2026, 3, 1)}, {price: 100, timestamp: at(2024, 1, 1)}], now);
    expect(s).toEqual({thisMonth: 10, last12Months: 15, purchases: 3});
  });

  it('groups a tab into this month and the five before it', () => {
    const rows = byMonth([{price: 14, amount: 2, timestamp: at(2026, 9, 1)}, {price: 7, amount: 1, timestamp: at(2026, 7, 3)}], new Date(2026, 8, 29));
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({kr: 14, count: 2});
    expect(rows[2]).toMatchObject({kr: 7, count: 1});
  });
});

describe('accounting', () => {
  it('has one row per resident, units per product, and a rounded total', () => {
    const p = (userId: string, productName: string, amount: number, price: number) =>
      ({userId, userName: userId.toUpperCase(), userRoom: '701', productName, amount, price});
    const a = accounts([p('a', 'Tuborg', 1, 7), p('a', 'Tuborg', 2, 14), p('a', 'Cola', 1, 6.1), p('b', 'Cola', 1, 6)]);
    expect(a.products).toEqual(['Cola', 'Tuborg']);
    expect(a.rows.find(r => r.userId === 'a')).toMatchObject({name: 'A', total: 27.1, units: {Tuborg: 3, Cola: 1}});
    expect(a.rows).toHaveLength(2);
  });

  it('keeps a product named like a column apart from the columns', () => {
    const a = accounts([{userId: 'a', userName: 'A', userRoom: null, productName: 'total', amount: 2, price: 10}]);
    expect(a.rows[0]).toMatchObject({total: 10, room: '', units: {total: 2}});
  });
});

describe('accounting periods and export', () => {
  const now = new Date(2026, 8, 29, 15);
  it('names periods by their first and last day', () => {
    expect(periodRange('thisMonth', now)).toEqual({from: new Date(2026, 8, 1), to: new Date(2026, 8, 29)});
    expect(periodRange('lastMonth', now)).toEqual({from: new Date(2026, 7, 1), to: new Date(2026, 7, 31)});
    expect(periodRange('last30', now)).toEqual({from: new Date(2026, 7, 31), to: new Date(2026, 8, 29)});
    expect(periodRange('thisYear', now)).toEqual({from: new Date(2026, 0, 1), to: new Date(2026, 8, 29)});
    expect(periodRange('lastMonth', new Date(2026, 0, 10))).toEqual({from: new Date(2025, 11, 1), to: new Date(2025, 11, 31)});
  });

  const a = accounts([
    {userId: 'a', userName: 'Anna; "A"', userRoom: '701', productName: 'Tuborg', amount: 2, price: 14},
    {userId: 'b', userName: 'Bo', userRoom: '702', productName: 'Cola', amount: 1, price: 6.5},
  ]);
  const labels = {name: 'Navn', room: 'Værelse', total: 'I alt, kr.', sum: 'I alt'};

  it('sums every column for the totals row', () => {
    expect(a.sums).toMatchObject({total: 20.5, allUnits: 3, purchases: 2, units: {Tuborg: 2, Cola: 1}, kr: {Tuborg: 14, Cola: 6.5}});
  });

  it('tables counts or kroner, with the total in kroner last', () => {
    expect(toTable(a, 'units', labels).rows[0]).toEqual(['Anna; "A"', '701', null, 2, 14]);
    expect(toTable(a, 'kr', labels).rows[1]).toEqual(['Bo', '702', 6.5, null, 6.5]);
    expect(toTable(a, 'units', labels).footer).toEqual(['I alt', '', 1, 2, 20.5]);
  });

  it('writes CSV for Danish Excel: BOM, semicolons, decimal commas, quoting', () => {
    const csv = toCsv(toTable(a, 'kr', labels));
    expect(csv.startsWith('﻿Navn;Værelse;Cola;Tuborg;I alt, kr.\r\n')).toBe(true);
    expect(csv).toContain('"Anna; ""A""";701;;14;14\r\n');
    expect(csv).toContain('Bo;702;6,5;;6,5\r\n');
    expect(csv.endsWith('I alt;;6,5;14;20,5\r\n')).toBe(true);
  });
});

describe('statistics', () => {
  it('starts the period at midnight, days - 1 days back', () => {
    expect(periodStart(7, new Date(2026, 8, 29, 15))).toEqual(new Date(2026, 8, 23));
  });

  it('totals, ranks products, fills every day and counts by weekday and hour', () => {
    const from = new Date(2026, 8, 23);
    const purchase = (d: number, h: number, productId: string, productName: string, amount: number, price: number, userId = 'u1') =>
      ({timestamp: at(2026, 9, d, h), productId, productName, amount, price, userId});
    const s = computeStats([
      purchase(28, 21, 'p1', 'Tuborg', 2, 14),
      purchase(28, 21, 'p2', 'Cola', 1, 6, 'u2'),
      purchase(29, 12, 'p1', 'Tuborg', 1, 7),
    ], from, 7, new Map([['p1', 4]]));
    expect(s.totals).toEqual({kr: 27, purchases: 3, units: 4, buyers: 2, profit: 27 - 6 - 12});
    expect(s.products.map(p => p.name)).toEqual(['Tuborg', 'Cola']);
    expect(s.daily).toHaveLength(7);
    expect(s.daily[5]).toMatchObject({kr: 20, purchases: 2});
    expect(s.heat[0][21]).toBe(2); // 28 September 2026 is a Monday
  });

  it('has no profit without cost prices, and level -1 for empty cells', () => {
    const s = computeStats([], new Date(2026, 8, 1), 3, new Map());
    expect(s.totals.profit).toBeNull();
    expect(heatLevel(0, [1, 2, 3, 4])).toBe(-1);
    expect(heatLevel(5, [1, 2, 3, 4])).toBe(4);
    expect(heatLevel(1, [1, 2, 3, 4])).toBe(0);
  });
});

describe('invites and kitchens', () => {
  it('makes codes without look-alike characters', () => {
    const code = newCode(200);
    expect(code).toHaveLength(200);
    expect(code).not.toMatch(/[0O1Il]/);
    expect(inviteLink('abc')).toMatch(/\/register\?invite=abc$/);
  });

  it('is open until used or expired', () => {
    const invite = {id: 'x', kitchenId: 'k', role: 'tablet' as const, createdBy: 'o', createdAt: at(2026, 9, 1), expiresAt: at(2026, 9, 15), usedBy: null, usedAt: null};
    expect(isOpen(invite, new Date(2026, 8, 10).getTime())).toBe(true);
    expect(isOpen(invite, new Date(2026, 8, 20).getTime())).toBe(false);
    expect(isOpen({...invite, usedBy: 'someone'}, new Date(2026, 8, 10).getTime())).toBe(false);
  });

  it('treats Gl4, Gamle 4 and gamle4 as one kitchen', () => {
    expect(kitchenKey('Gl4')).toBe(kitchenKey('Gamle 4'));
    expect(kitchenKey('Ml8')).toBe(kitchenKey('Mellemste 8'));
    expect(kitchenKey('Ny 2')).toBe(kitchenKey('ny2'));
  });

  it('groups messages into threads, newest first, counting unread', () => {
    const m = (kitchenId: string, day: number, seenByMaker: boolean) =>
      ({id: `${kitchenId}${day}`, kitchenId, text: 't', from: 'kitchen' as const, createdAt: at(2026, 9, day), seenByMaker, seenByKitchen: true});
    const threads = toThreads([{id: 'a', name: 'Ny2'}], [m('a', 1, true), m('b', 5, false), m('a', 3, false)]);
    expect(threads.map(t => t.kitchenName)).toEqual(['b', 'Ny2']);
    expect(threads[1]).toMatchObject({unread: 1, messages: [{id: 'a1'}, {id: 'a3'}]});
  });
});

describe('formatting', () => {
  it('writes kroner the Danish way', () => {
    expect(kr(1234.5)).toBe('1.234,5 kr.');
    expect(kr(3, 2)).toBe('3,00 kr.');
  });

  it('sorts text case-insensitively and numeric text as numbers', () => {
    expect(sortValue('Bo')).toBe('bo');
    expect(sortValue('701')).toBe(701);
    expect(sortValue(true)).toBe(1);
    expect(millis(null)).toBe(0);
  });
});

describe('buy page', () => {
  const words = {and: ' og ', bought: ' købte ', each: ' hver'};

  it('says who bought what, and "hver" for more than one', () => {
    expect(describeSale(['Anna'], [[2, 'Cola']], words)).toBe('Anna købte 2 Cola');
    expect(describeSale(['Anna', 'Bo'], [[2, 'Cola'], [3, 'Tuborg']], words)).toBe('Anna og Bo købte 2 Cola og 3 Tuborg hver');
    expect(joinNames(['A', 'B', 'C'], ' og ')).toBe('A, B og C');
  });

  it('puts the most bought products first, then by name', () => {
    expect(productOrder([{id: 'c', name: 'Cola', sold: 5}, {id: 'a', name: 'Apollinaris'}, {id: 't', name: 'Tuborg', sold: 40}, {id: 'b', name: 'Blanc'}]))
      .toEqual(['t', 'c', 'a', 'b']);
  });
});
