import {KitchenStats, usageDays, usageGrid, usageHours} from './interfaces/admin-stats';
import {USAGE_PAGES, usageLabel, usagePage} from './interfaces/usage';

describe('usagePage', () => {
  it('names the page and the tab', () => {
    expect(usagePage('/')).toBe('buy');
    expect(usagePage('/stats')).toBe('stats');
    expect(usagePage('/kollegiet')).toBe('kollegiet:board');
    expect(usagePage('/kollegiet?tab=battles#battle-x')).toBe('kollegiet:battles');
    expect(usagePage('/kollegiet/battle/abc')).toBe('battle');
    expect(usagePage('/aktuelt?tab=forslag')).toBe('aktuelt:forslag');
    expect(usagePage('/aktuelt')).toBe('aktuelt:nyt');
  });

  it('leaves out pages that are not counted', () => {
    expect(usagePage('/admin')).toBeNull();
    expect(usagePage('/inbox')).toBeNull();
    expect(usagePage('/login')).toBeNull();
    expect(usagePage('/kollegiet?tab=nonsense')).toBeNull();
  });

  it('labels pages and actions apart', () => {
    expect(usageLabel('v', 'kollegiet:board')).toBe('USAGE_PAGE_KOLLEGIET_BOARD');
    expect(usageLabel('a', 'buy-group')).toBe('USAGE_DO_BUY_GROUP');
  });
});

describe('usageGrid', () => {
  const kitchen = (id: string, t: Record<string, number>, m: Record<string, number>, hours: number[] = [], days = {}) =>
    ({id, name: id, usage: {d7: {t: {v: t, a: {}}, m: {v: m, a: {}}}, d30: {t: {v: t, a: {}}, m: {v: m, a: {}}}, hours, days}}) as unknown as KitchenStats;
  const a = kitchen('A', {buy: 10, stats: 1}, {buy: 2}, [0, 3], {'2026-10-02': 5});
  const b = kitchen('B', {buy: 1, newpage: 4}, {}, [1, 1], {'2026-10-02': 1, '2026-10-01': 2});

  it('sorts by use, shades against the busiest kitchen and lists the unused', () => {
    const g = usageGrid([a, b], USAGE_PAGES, 'v', 'd30', 'all');
    expect(g.rows.map(r => r.key)).toEqual(['buy', 'newpage', 'stats']);
    expect(g.rows[0].cells.map(c => [c.n, c.t, c.m, c.level])).toEqual([[12, 10, 2, 4], [1, 1, 0, 0]]);
    expect(g.rows[2].cells.map(c => c.level)).toEqual([4, -1]);
    expect(g.unused).toContain('food-club');
    expect(g.unused).not.toContain('buy');
  });

  it('counts only the chosen logins', () => {
    const g = usageGrid([a, b], USAGE_PAGES, 'v', 'd30', 'm');
    expect(g.rows.map(r => [r.key, r.total])).toEqual([['buy', 2]]);
  });

  it('adds up hours and days', () => {
    expect(usageHours([a, b]).slice(0, 3)).toEqual([1, 4, 0]);
    expect(usageDays([a, b])).toEqual([{day: '2026-10-01', n: 2}, {day: '2026-10-02', n: 6}]);
  });
});
