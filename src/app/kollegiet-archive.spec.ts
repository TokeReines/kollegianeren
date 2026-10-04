// @ts-expect-error: plain JavaScript, the nightly job's own code (ops/stats-summary.js uses it).
import {archive} from '../../ops/lib/kollegiet-archive.js';

const ts = (iso: string) => ({__t: 'ts', s: Date.parse(iso) / 1000, n: 0});
const month = (ms: number) => new Date(ms).toISOString().slice(0, 7);

describe('Kollegiet archive', () => {
  const months = archive({
    battles: [
      {title: 'Fredagsøl', metric: 'beer', participants: ['a', 'b'], to: ts('2026-10-03T22:00:00Z'), result: {winners: ['a'], scores: {a: 37, b: 20}}},
      {title: 'Alene', metric: 'beer', participants: ['a'], to: ts('2026-10-04T22:00:00Z'), result: {winners: ['a'], scores: {a: 5}}},
      {title: 'September', metric: 'gym', participants: ['a', 'c'], to: ts('2026-09-20T10:00:00Z'), result: {winners: ['c'], scores: {c: 9}}},
    ],
    polls: [
      {title: 'Hyggeligst', kitchenId: 'b', closesAt: ts('2026-10-02T10:00:00Z'), result: {winners: ['b'], votes: {b: 3}}},
      {title: 'Toke er the goat?', kitchenId: 'c', cancelled: true, closesAt: ts('2026-10-02T12:00:00Z'), result: {winners: [], votes: {}}},
    ],
    kudos: [
      {to: 'a', kind: 'highfive', createdAt: ts('2026-10-01T10:00:00Z')},
      {to: 'a', kind: 'highfive', createdAt: ts('2026-10-02T10:00:00Z')},
      {to: 'a', from: 'b', kind: 'badge', badge: 'bestParty', reason: 'Vild fest', createdAt: ts('2026-10-02T11:00:00Z')},
    ],
    posts: [
      {id: 'p1', kitchenId: 'b', text: 'Raclette?', parentId: null, createdAt: ts('2026-10-01T10:00:00Z')},
      {id: 'r1', kitchenId: 'a', text: 'Ja', parentId: 'p1', createdAt: ts('2026-10-01T11:00:00Z')},
      {id: 'p2', kitchenId: 'c', text: 'Ingen svar', parentId: null, createdAt: ts('2026-10-01T12:00:00Z')},
    ],
  }, month);

  it('keeps battles won between two kitchens or more, and votes with a winner', () => {
    expect(months['2026-10'].battles.map((b: {title: string}) => b.title)).toEqual(['Fredagsøl']);
    expect(months['2026-09'].battles.map((b: {title: string}) => b.title)).toEqual(['September']);
    expect(months['2026-10'].polls.map((p: {title: string}) => p.title)).toEqual(['Hyggeligst']);
  });

  it('counts high-fives and badges per kitchen, and keeps the notes with replies', () => {
    expect(months['2026-10'].kudos).toEqual({a: {highfives: 2, badges: {bestParty: 1}}});
    // Each one, newest first, for the history: the badge's reason kept, a high-five's badge null.
    expect(months['2026-10'].given.map((g: {badge: string | null, reason: string}) => [g.badge, g.reason]))
      .toEqual([['bestParty', 'Vild fest'], [null, ''], [null, '']]);
    expect(months['2026-10'].notes).toEqual([{kitchenId: 'b', text: 'Raclette?', replies: 1, at: Date.parse('2026-10-01T10:00:00Z')}]);
  });
});
