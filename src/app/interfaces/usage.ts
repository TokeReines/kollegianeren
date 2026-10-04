// What the app counts for the maker's Admin page (services/usage.service.ts): which pages are
// opened and which actions are used, per kitchen and day. Counts only, nothing per resident.
// The labels are USAGE_PAGE_<KEY> and USAGE_DO_<KEY> in the translations (usageLabel).

// Pages, from the address: the first part, and the tab on Kollegiet and Aktuelt.
export const USAGE_PAGES = [
  'buy', 'food-club', 'stats', 'kollegiet:board', 'kollegiet:battles', 'kollegiet:kitchens', 'kollegiet:archive', 'battle',
  'aktuelt:nyt', 'aktuelt:forslag', 'aktuelt:om', 'products', 'users', 'accounting', 'access',
] as const;

export const USAGE_ACTIONS = [
  // The app
  'open', 'bell', 'notice-open', 'notice-dismiss', 'banner', 'theme', 'language',
  // Buying
  'buy', 'buy-group', 'purchase-remove',
  // Food club
  'meal-add', 'meal-edit', 'meal-delete', 'meal-cook', 'meal-signup', 'meal-signoff', 'meal-bill', 'meal-bill-undo',
  // Kollegiet
  'post', 'post-reply', 'highfive', 'badge', 'event', 'event-edit', 'rsvp', 'who-is-coming', 'live-call', 'live-call-end',
  'poll', 'poll-close', 'vote', 'battle', 'battle-join', 'battle-calloff', 'gym', 'profile', 'shelf-guide', 'take-back', 'hide', 'note-take-down', 'lend-ask',
  // Aktuelt
  'proposal-comment', 'proposal-vote', 'message', 'picture',
  // Statistik
  'stats-period', 'stats-food',
  // Managing
  'product-add', 'product-edit', 'product-delete', 'stock', 'resident-add', 'resident-edit', 'resident-delete',
  'move-out', 'move-in', 'anonymise', 'resident-link', 'invite', 'invite-revoke', 'member-remove', 'kitchen-rename',
  'accounting-csv', 'accounting-xlsx', 'accounting-paid', 'accounting-message', 'export-json', 'export-csv',
] as const;

export type UsagePage = typeof USAGE_PAGES[number];
export type UsageAction = typeof USAGE_ACTIONS[number];

export type Counts = Record<string, number>;

// kitchens/{kid}/usage/{day}: per kind of login (t: tablet, m: owner or treasurer), the page views
// (v), actions (a), how many of either fell in each hour (h, "0" to "23"), and the documents read
// (r, "page|collection|open, live or get", read-meter.ts).
export interface UsageDay {
  t?: {v?: Counts, a?: Counts, h?: Counts, r?: Counts};
  m?: {v?: Counts, a?: Counts, h?: Counts, r?: Counts};
}

export function usageLabel(kind: 'v' | 'a', key: string): string {
  return (kind === 'v' ? 'USAGE_PAGE_' : 'USAGE_DO_') + key.toUpperCase().replace(/[-:]/g, '_');
}

// The page an address counts as, or null for one that is not counted (admin, inbox, login...).
export function usagePage(url: string): UsagePage | null {
  const [path, query = ''] = url.split('#')[0].split('?');
  const parts = path.split('/').filter(Boolean);
  const tab = new URLSearchParams(query).get('tab');
  const page = parts[0] === 'kollegiet' && parts[1] === 'battle' ? 'battle'
    : parts[0] === 'kollegiet' ? `kollegiet:${tab ?? 'board'}`
    : parts[0] === 'aktuelt' ? `aktuelt:${tab ?? 'nyt'}`
    : parts[0] ?? 'buy';
  return (USAGE_PAGES as readonly string[]).includes(page) ? page as UsagePage : null;
}
