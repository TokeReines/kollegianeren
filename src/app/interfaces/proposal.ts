import {Timestamp} from 'firebase/firestore';
import {millis} from '../time';
import {NEWS_DAYS, Notice} from './kollegiet';

// Forslag on Aktuelt (docs/aktuelt.md): feature proposals the maker puts up, with pictures, for
// every kitchen to comment on and give a thumbs up. Only the maker makes them; kitchens ask for
// features by writing to him.
export const PROPOSAL_STATUSES = ['open', 'planned', 'done', 'dropped'] as const;
export type ProposalStatus = typeof PROPOSAL_STATUSES[number];

export const PROPOSAL_TITLE_MAX = 120;
export const PROPOSAL_BODY_MAX = 5000;
export const PROPOSAL_IMAGES_MAX = 6;
export const COMMENT_MAX = 1000;
export const REPLY_IMAGES_MAX = 4;

export interface Proposal {
  id: string;
  title: string;
  body: string;
  // Cloudinary public ids.
  images: string[];
  status: ProposalStatus;
  // The kitchens that want it: {kitchenId: true}.
  votes: Record<string, true>;
  createdAt: Timestamp;
  // When the maker last changed it, and when its status last changed.
  updatedAt: Timestamp;
  statusAt: Timestamp;
}

export interface ProposalComment {
  id: string;
  // A kitchen's id, or 'maker'.
  from: string;
  text: string;
  // Pictures, only in the maker's replies.
  images: string[];
  createdAt: Timestamp;
}

export const MAKER = 'maker';

// Still open for talk first (most wanted first, then newest), then done, then dropped.
export function sortProposals(list: Proposal[]): Proposal[] {
  const order: Record<ProposalStatus, number> = {open: 0, planned: 0, done: 1, dropped: 2};
  const votes = (p: Proposal) => Object.keys(p.votes ?? {}).length;
  return [...list].sort((a, b) => order[a.status] - order[b.status]
    || (order[a.status] === 0 ? votes(b) - votes(a) : 0)
    || millis(b.createdAt) - millis(a.createdAt));
}

// For the strip and the bell: a new proposal, or one that became implemented, since the kitchen
// last opened Aktuelt (and within NEWS_DAYS).
export function proposalNotices(proposals: Proposal[], seenAt: number, now = Date.now()): Notice[] {
  const since = Math.max(seenAt, now - NEWS_DAYS * 864e5);
  const notices: Notice[] = [];
  for (const p of proposals) {
    const link = {path: '/aktuelt', query: {tab: 'forslag'}, fragment: `proposal-${p.id}`};
    if (millis(p.createdAt) > since) {
      notices.push({kind: 'proposal', from: null, text: p.title, at: millis(p.createdAt), link});
    } else if (p.status === 'done' && millis(p.statusAt) > since) {
      notices.push({kind: 'proposal', from: null, text: p.title, at: millis(p.statusAt), link, done: true});
    }
  }
  return notices;
}
