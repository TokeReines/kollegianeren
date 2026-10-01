import {Timestamp} from 'firebase/firestore';
import {millis} from '../time';
import {MealTag} from './meal';

// Kollegiet: the kitchens of the dorm together (docs/kollegiet.md). Everything here is per
// kitchen, never per resident: no names, no per-resident numbers.

// What other kitchens see next to the name (profiles/{kid}).
export interface Profile {
  id: string;
  emoji: string;
  colour: KitchenColour;
  bio: string;
  updatedAt: Timestamp;
}

export const KITCHEN_EMOJIS = ['🍺', '🍕', '🌮', '🍝', '🥗', '🔥', '🎉', '🎸', '⚽', '🏋️', '🐙', '🦊', '🐻', '🌻', '🚀', '👑'] as const;
// Material tone names; the page maps them to --mat-sys-* or fixed swatches.
export const KITCHEN_COLOURS = ['purple', 'blue', 'teal', 'green', 'lime', 'amber', 'orange', 'red', 'pink', 'grey'] as const;
export type KitchenColour = typeof KITCHEN_COLOURS[number];

export const BIO_MAX = 200;
export const POST_MAX = 1000;
export const REASON_MAX = 140;
export const TITLE_MAX = 80;

// The board (posts/{id}). Replies are posts with parentId; `to` is a kitchen for a direct post.
export interface Post {
  id: string;
  kitchenId: string;
  text: string;
  to: string | null;
  parentId: string | null;
  createdAt: Timestamp;
}

export const EVENT_KINDS = ['openKitchen', 'party', 'dinner', 'other'] as const;
export type EventKind = typeof EVENT_KINDS[number];
export type Rsvp = 'yes' | 'maybe' | 'no';

// An event (events/{id}): for everyone or a few kitchens, with one answer per kitchen.
export interface KEvent {
  id: string;
  kitchenId: string;
  kind: EventKind;
  title: string;
  text: string;
  place: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  invited: 'all' | string[];
  rsvp: Record<string, Rsvp>;
  createdAt: Timestamp;
}

export const METRICS = ['drinks', 'beer', 'mealDiners', 'plantMeals', 'gym'] as const;
export type Metric = typeof METRICS[number];

// A battle (battles/{id}): kitchen against kitchen, live between `from` and `to`.
export interface Battle {
  id: string;
  kitchenId: string;
  title: string;
  metric: Metric;
  from: Timestamp;
  to: Timestamp;
  invited: 'all' | string[];
  participants: string[];
  createdAt: Timestamp;
  // Written by ops/league.js once it has ended: the checked numbers.
  result?: {scores: Record<string, number>, winners: string[], settledAt: Timestamp} | null;
}

// A kitchen's live score in a battle (battles/{id}/tally/{kid}).
export interface Tally {
  id: string;
  // drinks, beer, diners, gym: the count. plantMeals: plant-based meals.
  value: number;
  // plantMeals only: all meals.
  total?: number;
  // The last increments, for the burst.
  ticks: Tick[];
  updatedAt: Timestamp;
}

export interface Tick {
  at: Timestamp;
  n: number;
}

export const TICKS_KEPT = 30;
export const MAX_LIVE_BATTLES = 3;
export const BATTLE_MAX_DAYS = 31;
// How long the burst on the scoreboard looks back.
export const BURST_MINUTES = 20;

export const BADGES = ['goodFriends', 'bestParty', 'bestFood', 'helpful', 'recycling', 'plantBased', 'cosy', 'loud'] as const;
export type Badge = typeof BADGES[number];

// A high-five or a badge from one kitchen to another (kudos/{id}).
export interface Kudos {
  id: string;
  from: string;
  to: string;
  kind: 'highfive' | 'badge';
  badge: Badge | null;
  reason: string;
  createdAt: Timestamp;
}

// A vote started by a kitchen (polls/{kid}_{month}); the votes are secret.
export interface Poll {
  id: string;
  kitchenId: string;
  title: string;
  opensAt: Timestamp;
  closesAt: Timestamp;
  createdAt: Timestamp;
  // Written by ops/league.js after closing: who won and with how many votes.
  result?: {votes: Record<string, number>, winners: string[], settledAt: Timestamp} | null;
}

// A kitchen's trophy shelf (standings/{kid}), written by ops/league.js.
export interface Standing {
  id: string;
  wins: number;
  badges: Partial<Record<Badge, number>>;
  highfives: number;
  // Polls won, by title.
  titles?: string[];
  updatedAt: Timestamp;
  // Kudos up to here are in the counts (ops/league.js --daily); older documents only have updatedAt.
  kudosThrough?: Timestamp;
}

export interface KudosSummary {
  wins: number;
  highfives: number;
  badges: Partial<Record<Badge, number>>;
}

// What each kitchen has been given: the league job's counts, plus the kudos it has not counted yet.
export function kudosSummary(standings: Standing[], kudos: Kudos[]): Map<string, KudosSummary> {
  const out = new Map<string, KudosSummary>();
  const get = (id: string) => out.get(id) ?? out.set(id, {wins: 0, highfives: 0, badges: {}}).get(id)!;
  const through = new Map<string, number>();
  for (const s of standings) {
    const e = get(s.id);
    e.wins = s.wins ?? 0;
    e.highfives = s.highfives ?? 0;
    e.badges = {...(s.badges ?? {})};
    through.set(s.id, millis(s.kudosThrough ?? s.updatedAt));
  }
  for (const k of kudos) {
    if (k.createdAt && millis(k.createdAt) <= (through.get(k.to) ?? -1)) {
      continue;
    }
    const e = get(k.to);
    if (k.kind === 'highfive') {
      e.highfives++;
    } else if (k.badge) {
      e.badges[k.badge] = (e.badges[k.badge] ?? 0) + 1;
    }
  }
  return out;
}

// Badges as [badge, count], in the fixed order.
export function badgeList(summary: KudosSummary | undefined): [Badge, number][] {
  const b = summary?.badges ?? {};
  return BADGES.filter(x => b[x]).map(x => [x, b[x]!]);
}

// Claimed live by the kitchen's tablet (standings/{kid}/achievements/{code}); the rules check the tally.
export interface Achievement {
  id: string;
  battle: string | null;
  at: Timestamp;
}

// Live achievements and what earns them. The same thresholds are in firestore.rules.
export const LIVE_ACHIEVEMENTS: Record<string, {metric: Metric | null, min: number}> = {
  firstBattle: {metric: null, min: 1},
  drinks100: {metric: 'drinks', min: 100},
  beer50: {metric: 'beer', min: 50},
  beer100: {metric: 'beer', min: 100},
  diners50: {metric: 'mealDiners', min: 50},
  gym25: {metric: 'gym', min: 25},
};

// Live achievements a tally has earned that the kitchen does not have yet.
export function earnedAchievements(battle: Pick<Battle, 'metric'>, tally: Pick<Tally, 'value'> | undefined, have: Set<string>): string[] {
  const value = tally?.value ?? 0;
  return Object.entries(LIVE_ACHIEVEMENTS)
    .filter(([code, a]) => !have.has(code) && (a.metric === null || a.metric === battle.metric) && value >= a.min)
    .map(([code]) => code);
}

export type BattleState = 'upcoming' | 'live' | 'ended';

export function battleState(b: Pick<Battle, 'from' | 'to'>, now = Date.now()): BattleState {
  return now < millis(b.from) ? 'upcoming' : now < millis(b.to) ? 'live' : 'ended';
}

export function isInvited(item: {invited: 'all' | string[], kitchenId: string}, kitchenId: string): boolean {
  return item.kitchenId !== kitchenId && (item.invited === 'all' || item.invited.includes(kitchenId));
}

// A kitchen's score: the count, or for plantMeals the share of meals in percent.
export function score(metric: Metric, t: Pick<Tally, 'value' | 'total'> | undefined): number {
  if (!t) {
    return 0;
  }
  if (metric === 'plantMeals') {
    return t.total ? Math.round(100 * t.value / t.total) : 0;
  }
  return t.value;
}

export interface Row {
  kitchenId: string;
  score: number;
  rank: number;
  burst: number;
}

// The scoreboard: participants by score, ties sharing a rank. Uses the settled result once there is one.
export function scoreboard(battle: Battle, tallies: Tally[], now = Date.now()): Row[] {
  const byId = new Map(tallies.map(t => [t.id, t]));
  const rows = battle.participants.map(kitchenId => ({
    kitchenId,
    score: battle.result ? battle.result.scores[kitchenId] ?? 0 : score(battle.metric, byId.get(kitchenId)),
    burst: battle.metric === 'plantMeals' ? 0 : burst(byId.get(kitchenId)?.ticks ?? [], now),
    rank: 0,
  })).sort((a, b) => b.score - a.score || a.kitchenId.localeCompare(b.kitchenId));
  rows.forEach((r, i) => r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1);
  return rows;
}

// How much a kitchen moved in the last minutes: "+20 på 20 min".
export function burst(ticks: Tick[], now = Date.now(), minutes = BURST_MINUTES): number {
  const since = now - minutes * 60e3;
  return ticks.filter(t => millis(t.at) >= since).reduce((n, t) => n + t.n, 0);
}

// The ticks after one more increment, newest last, at most TICKS_KEPT.
export function addTick(ticks: Tick[] | undefined, n: number, at: Timestamp): Tick[] {
  return [...(ticks ?? []), {at, n}].slice(-TICKS_KEPT);
}

// The battles a kitchen is in right now.
export function liveFor(battles: Battle[], kitchenId: string, now = Date.now()): Battle[] {
  return battles.filter(b => b.participants.includes(kitchenId) && battleState(b, now) === 'live');
}

// Whether a moment falls inside a battle.
export function during(b: Pick<Battle, 'from' | 'to'>, at: number): boolean {
  return at >= millis(b.from) && at < millis(b.to);
}

// What a sale moves in a battle: units for drinks, units of beer for beer, nothing otherwise.
export function saleUnits(metric: Metric, product: {category?: string | null}, units: number): number {
  return metric === 'drinks' || (metric === 'beer' && product.category === 'beer') ? units : 0;
}

export const PLANT_TAGS: MealTag[] = ['vegetarian', 'vegan'];

export function isPlantMeal(tags: MealTag[]): boolean {
  return tags.some(t => PLANT_TAGS.includes(t));
}

// A post with its replies, newest thread first, replies oldest first.
export interface PostThread {
  post: Post;
  replies: Post[];
}

export function threads(posts: Post[]): PostThread[] {
  const replies = new Map<string, Post[]>();
  for (const p of posts) {
    if (p.parentId) {
      replies.set(p.parentId, [...(replies.get(p.parentId) ?? []), p]);
    }
  }
  return posts.filter(p => !p.parentId)
    .map(post => ({post, replies: (replies.get(post.id) ?? []).sort((a, b) => millis(a.createdAt) - millis(b.createdAt))}))
    .sort((a, b) => lastActivity(b) - lastActivity(a));
}

function lastActivity(t: PostThread): number {
  return Math.max(millis(t.post.createdAt), ...t.replies.map(r => millis(r.createdAt)));
}

export function rsvpCounts(e: Pick<KEvent, 'rsvp'>): Record<Rsvp, number> {
  const counts: Record<Rsvp, number> = {yes: 0, maybe: 0, no: 0};
  Object.values(e.rsvp ?? {}).forEach(r => counts[r]++);
  return counts;
}

// A poll's document id: one per kitchen per month.
export function pollId(kitchenId: string, opensAt: Date): string {
  return `${kitchenId}_${opensAt.getFullYear()}-${String(opensAt.getMonth() + 1).padStart(2, '0')}`;
}

// A high-five's document id: one per kitchen pair per day.
export function highfiveId(from: string, to: string, day: string): string {
  return `${from}_${to}_${day}`;
}

// Notifications, most important first (docs/kollegiet.md, Notifications).
// 'news' is a post on Aktuelt, for every kitchen.
export type NoticeKind = 'maker' | 'news' | 'invite' | 'challenge' | 'kudos' | 'event';

export interface Notice {
  kind: NoticeKind;
  // The kitchen it is from, if any.
  from: string | null;
  text: string;
  at: number;
  link: {path: string, fragment?: string, query?: Record<string, string>};
  // Kudos: the badge, or null for a high-five.
  badge?: Badge | null;
}

const NOTICE_ORDER: NoticeKind[] = ['maker', 'news', 'invite', 'challenge', 'kudos', 'event'];

export function sortNotices(notices: Notice[]): Notice[] {
  return [...notices].sort((a, b) => NOTICE_ORDER.indexOf(a.kind) - NOTICE_ORDER.indexOf(b.kind) || b.at - a.at);
}

// How far back a post on Aktuelt counts as news, for a kitchen that has never opened Aktuelt.
export const NEWS_DAYS = 14;

// Posts on Aktuelt since the kitchen last opened it (`seenAt`), each its own notice.
export function newsNotices(announcements: {id: string, title: string, createdAt: Timestamp}[], seenAt: number,
                            now = Date.now()): Notice[] {
  const since = Math.max(seenAt, now - NEWS_DAYS * 864e5);
  return announcements.filter(a => millis(a.createdAt) > since).map(a => ({kind: 'news' as const, from: null, text: a.title,
    at: millis(a.createdAt), link: {path: '/aktuelt', fragment: `news-${a.id}`}}));
}

// What Kollegiet has for a kitchen that it has not seen: invitations and challenges to it, kudos it
// received, events for everyone in the next days. `seenAt` is when it last opened Kollegiet.
export function kollegietNotices(kitchenId: string, seenAt: number, data: {events: KEvent[], battles: Battle[], kudos: Kudos[]},
                                 now = Date.now()): Notice[] {
  const notices: Notice[] = [];
  for (const e of data.events) {
    const fresh = millis(e.createdAt) > seenAt && !e.rsvp?.[kitchenId] && millis(e.endsAt) > now;
    if (fresh && isInvited(e, kitchenId)) {
      const soon = e.invited === 'all' && millis(e.startsAt) - now < 3 * 864e5;
      if (e.invited !== 'all' || soon) {
        notices.push({kind: e.invited === 'all' ? 'event' : 'invite', from: e.kitchenId, text: e.title, at: millis(e.createdAt),
          link: {path: '/kollegiet', query: {tab: 'board'}, fragment: `event-${e.id}`}});
      }
    }
  }
  for (const b of data.battles) {
    if (millis(b.createdAt) > seenAt && isInvited(b, kitchenId) && !b.participants.includes(kitchenId) && battleState(b, now) !== 'ended') {
      notices.push({kind: 'challenge', from: b.kitchenId, text: b.title, at: millis(b.createdAt),
        link: {path: '/kollegiet', query: {tab: 'battles'}, fragment: `battle-${b.id}`}});
    }
  }
  for (const k of data.kudos) {
    if (k.to === kitchenId && millis(k.createdAt) > seenAt) {
      notices.push({kind: 'kudos', from: k.from, text: k.reason, at: millis(k.createdAt), badge: k.kind === 'badge' ? k.badge : null,
        link: {path: '/kollegiet', query: {tab: 'kitchens', kitchen: kitchenId}}});
    }
  }
  return notices;
}
