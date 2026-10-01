import {Timestamp} from 'firebase/firestore';
import {
  Battle, KEvent, Kudos, Post, Tally, addTick, battleState, burst, during, earnedAchievements, highfiveId, isInvited, kollegietNotices,
  pollId, rsvpCounts, saleUnits, score, scoreboard, sortNotices, threads,
} from './interfaces/kollegiet';

const T = (ms: number) => Timestamp.fromMillis(ms);
const NOW = Date.UTC(2026, 9, 2, 20, 0);
const H = 3600e3;

const battle = (extra: Partial<Battle> = {}): Battle => ({
  id: 'b', kitchenId: 'A', title: 'Fredagsøl', metric: 'beer', from: T(NOW - H), to: T(NOW + H), invited: 'all',
  participants: ['A', 'B', 'C'], createdAt: T(NOW - 2 * H), ...extra,
});
const tally = (id: string, value: number, ticks: [number, number][] = [], total?: number): Tally =>
  ({id, value, total, ticks: ticks.map(([at, n]) => ({at: T(at), n})), updatedAt: T(NOW)});

describe('kollegiet battles', () => {
  it('is upcoming, live or ended by the clock', () => {
    expect(battleState(battle(), NOW - 2 * H)).toBe('upcoming');
    expect(battleState(battle(), NOW)).toBe('live');
    expect(battleState(battle(), NOW + H)).toBe('ended');
    expect(during(battle(), NOW - H)).toBe(true);
    expect(during(battle(), NOW + H)).toBe(false);
  });

  it('ranks kitchens by score, ties share a rank, with the burst of the last 20 minutes', () => {
    const rows = scoreboard(battle(), [
      tally('A', 12, [[NOW - 5 * 60e3, 6], [NOW - 30 * 60e3, 6]]),
      tally('B', 20, [[NOW - 60e3, 20]]),
      tally('C', 12),
    ], NOW);
    expect(rows.map(r => [r.kitchenId, r.rank, r.burst])).toEqual([['B', 1, 20], ['A', 2, 6], ['C', 2, 0]]);
  });

  it('uses the settled result once there is one, and kitchens without a tally score 0', () => {
    const settled = battle({result: {scores: {A: 30, B: 10}, winners: ['A'], settledAt: T(NOW)}});
    expect(scoreboard(settled, [tally('B', 99)], NOW).map(r => [r.kitchenId, r.score])).toEqual([['A', 30], ['B', 10], ['C', 0]]);
  });

  it('scores plant-based dinners as a share', () => {
    expect(score('plantMeals', tally('A', 3, [], 4))).toBe(75);
    expect(score('plantMeals', tally('A', 0, [], 0))).toBe(0);
    expect(score('beer', undefined)).toBe(0);
  });

  it('counts a sale for drinks always and for beer only when it is beer', () => {
    expect(saleUnits('drinks', {category: 'soda'}, 3)).toBe(3);
    expect(saleUnits('beer', {category: 'beer'}, 3)).toBe(3);
    expect(saleUnits('beer', {category: 'soda'}, 3)).toBe(0);
    expect(saleUnits('beer', {}, 3)).toBe(0);
    expect(saleUnits('gym', {category: 'beer'}, 3)).toBe(0);
  });

  it('keeps the last 30 ticks', () => {
    let ticks = addTick(undefined, 1, T(NOW));
    for (let i = 0; i < 40; i++) {
      ticks = addTick(ticks, i, T(NOW + i));
    }
    expect(ticks.length).toBe(30);
    expect(ticks[29].n).toBe(39);
    expect(burst(ticks, NOW + 60e3)).toBe(Array.from({length: 30}, (_, i) => i + 10).reduce((a, b) => a + b, 0));
  });

  it('earns live achievements once, for the right metric', () => {
    expect(earnedAchievements({metric: 'beer'}, {value: 60}, new Set())).toEqual(['firstBattle', 'beer50']);
    expect(earnedAchievements({metric: 'beer'}, {value: 120}, new Set(['firstBattle', 'beer50']))).toEqual(['beer100']);
    expect(earnedAchievements({metric: 'gym'}, {value: 0}, new Set())).toEqual([]);
  });
});

describe('kollegiet board', () => {
  const post = (id: string, at: number, parentId: string | null = null): Post =>
    ({id, kitchenId: 'A', text: id, to: null, parentId, createdAt: T(at)});

  it('groups replies under their post, the thread with the newest activity first', () => {
    const t = threads([post('old', NOW - 3 * H), post('new', NOW - H), post('r2', NOW, 'old'), post('r1', NOW - 2 * H, 'old')]);
    expect(t.map(x => x.post.id)).toEqual(['old', 'new']);
    expect(t[0].replies.map(r => r.id)).toEqual(['r1', 'r2']);
  });

  it('counts the answers to an event', () => {
    expect(rsvpCounts({rsvp: {A: 'yes', B: 'yes', C: 'maybe'}})).toEqual({yes: 2, maybe: 1, no: 0});
  });

  it('invites everyone or a list, never the kitchen itself', () => {
    expect(isInvited({invited: 'all', kitchenId: 'A'}, 'B')).toBe(true);
    expect(isInvited({invited: 'all', kitchenId: 'A'}, 'A')).toBe(false);
    expect(isInvited({invited: ['B'], kitchenId: 'A'}, 'C')).toBe(false);
  });

  it('makes one poll a month and one high-five a day per pair', () => {
    expect(pollId('A', new Date(2026, 9, 31))).toBe('A_2026-10');
    expect(highfiveId('A', 'B', '2026-10-02')).toBe('A_B_2026-10-02');
  });
});

describe('kollegiet notifications', () => {
  const event = (extra: Partial<KEvent>): KEvent => ({
    id: 'e', kitchenId: 'B', kind: 'party', title: 'Fest', text: '', place: '', startsAt: T(NOW + 24 * H), endsAt: T(NOW + 28 * H),
    invited: ['A'], rsvp: {}, createdAt: T(NOW - H), ...extra,
  });
  const kudos: Kudos = {id: 'k', from: 'C', to: 'A', kind: 'highfive', badge: null, reason: '', createdAt: T(NOW - H)};

  it('shows invitations, challenges, kudos and events for everyone soon, newer than the last look', () => {
    const notices = kollegietNotices('A', NOW - 2 * H, {
      events: [event({}), event({id: 'all', invited: 'all'}), event({id: 'far', invited: 'all', startsAt: T(NOW + 10 * 24 * H), endsAt: T(NOW + 11 * 24 * H)})],
      battles: [battle({kitchenId: 'B', participants: ['B'], createdAt: T(NOW - H)})],
      kudos: [kudos],
    }, NOW);
    expect(sortNotices(notices).map(n => n.kind)).toEqual(['invite', 'challenge', 'kudos', 'event']);
  });

  it('drops what was seen, answered or joined', () => {
    expect(kollegietNotices('A', NOW, {events: [event({})], battles: [], kudos: [kudos]}, NOW)).toEqual([]);
    expect(kollegietNotices('A', 0, {events: [event({rsvp: {A: 'no'}})], battles: [battle({createdAt: T(NOW)})], kudos: []}, NOW)).toEqual([]);
  });
});
