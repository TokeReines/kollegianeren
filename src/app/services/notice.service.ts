import {Injectable, computed, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {Notice, NoticeKind, kollegietNotices, newsNotices, sortNotices} from '../interfaces/kollegiet';
import {millis} from '../time';
import {proposalNotices} from '../interfaces/proposal';
import {AuthService} from './auth.service';
import {KollegietService} from './kollegiet.service';
import {LeagueService} from './league.service';
import {MakerService} from './maker.service';
import {ProposalService} from './proposal.service';
import {TranslateService} from './translate.service';
import {UsageService} from './usage.service';

const ICONS: Record<NoticeKind, string> = {
  live: 'nightlife', proposal: 'lightbulb', maker: 'mark_email_unread', news: 'campaign', invite: 'celebration', challenge: 'sports_kabaddi', kudos: 'front_hand', event: 'event',
};

// Everything waiting for the kitchen, most important first: a message from the maker, news on
// Aktuelt, then what Kollegiet has for it (docs/kollegiet.md, Notifications). The strip under the
// top bar shows the first, the bell lists them all.
@Injectable({providedIn: 'root'})
export class NoticeService {
  private readonly usage = inject(UsageService);
  private readonly auth = inject(AuthService);
  private readonly kollegiet = inject(KollegietService);
  private readonly league = inject(LeagueService);
  private readonly i18n = inject(TranslateService);
  private readonly maker = inject(MakerService);

  private readonly unread = toSignal(this.maker.unreadByKitchen$, {initialValue: []});
  private readonly news = toSignal(this.maker.recentAnnouncements$, {initialValue: []});
  private readonly proposals = toSignal(inject(ProposalService).recent$, {initialValue: []});
  private readonly events = toSignal(this.kollegiet.events$, {initialValue: []});
  private readonly kudos = toSignal(this.kollegiet.kudos$, {initialValue: []});
  // Until the seen document is in, nothing counts as new.
  private readonly seenAt = toSignal(this.kollegiet.seen$, {initialValue: Number.MAX_SAFE_INTEGER});
  private readonly aktueltSeenAt = toSignal(this.kollegiet.aktueltSeen$, {initialValue: Number.MAX_SAFE_INTEGER});

  readonly notices = computed<Notice[]>(() => {
    const kid = this.auth.membership()?.kitchenId;
    // Only a login of a real kitchen: the maker's own login has none, and could never mark
    // anything seen, so the strip would come back on every page.
    if (!kid || !this.kollegiet.byId().has(kid)) {
      return [];
    }
    const latest = this.unread()[0];
    const maker: Notice[] = latest ? [{kind: 'maker', from: null, text: latest.text, at: millis(latest.createdAt),
      link: {path: '/aktuelt', fragment: 'message'}}] : [];
    return sortNotices([...maker, ...newsNotices(this.news(), this.aktueltSeenAt()),
      ...proposalNotices(this.proposals(), this.aktueltSeenAt()), ...kollegietNotices(kid, this.seenAt(), {
      events: this.events(), battles: this.league.battles(), kudos: this.kudos(),
    }, Math.max(this.league.now(), Date.now()))]);
  });

  readonly makerUnread = computed(() => this.unread().length);

  // New posts from other kitchens: the badge on the Kollegiet menu item.
  private readonly newPosts = toSignal(this.kollegiet.newPosts$, {initialValue: []});
  readonly kollegietBadge = computed(() => {
    const kid = this.auth.membership()?.kitchenId;
    if (!kid || !this.kollegiet.byId().has(kid)) {
      return 0;
    }
    return this.newPosts().filter(p => p.kitchenId !== kid).length
      + this.notices().filter(n => fromKollegiet(n)).length;
  });

  icon(n: Notice): string {
    return ICONS[n.kind];
  }

  // The headline: who and what. The notice's own text is the preview under it.
  title(n: Notice): string {
    switch (n.kind) {
      case 'maker':
        return this.makerUnread() > 1 ? `${this.makerUnread()} ${this.i18n.t('MESSAGES_FROM_TOKE')}` : this.i18n.t('MESSAGE_FROM_TOKE');
      case 'news':
        return this.i18n.t('NOTICE_news');
      case 'proposal':
        return this.i18n.t(n.done ? 'NOTICE_proposal_done' : 'NOTICE_proposal');
      case 'kudos': {
        const card = this.kollegiet.card(n.from ?? '');
        const what = n.badge
          ? `${this.i18n.t('NOTICE_KUDOS_BADGE')} ${this.i18n.t('KOL_BADGE_ICON_' + n.badge)} ${this.i18n.t('KOL_BADGE_' + n.badge)}`
          : this.i18n.t('NOTICE_KUDOS_HIGHFIVE');
        return `${card.emoji} ${card.name} ${what}`;
      }
      default: {
        const card = this.kollegiet.card(n.from ?? '');
        return `${card.emoji} ${card.name} ${this.i18n.t('NOTICE_' + n.kind)}`;
      }
    }
  }

  // Whether "not now" is offered: a message from the maker stays until it is read.
  canDismiss(n: Notice): boolean {
    return n.kind !== 'maker';
  }

  // "Not now": the same as having looked, for Aktuelt or for everything from Kollegiet. For a
  // live call it answers no, so the party sees it, and it stops showing.
  dismiss(n: Notice) {
    this.usage.act('notice-dismiss');
    if (n.kind === 'live' && n.eventId) {
      return this.kollegiet.rsvp({id: n.eventId}, 'no');
    }
    return n.kind === 'news' || n.kind === 'proposal' ? this.kollegiet.markAktueltSeen() : this.kollegiet.markSeen();
  }

  // Shown on every page except where it leads: Aktuelt for the maker's things, Kollegiet for its
  // own. A live call has its own bar on the buy page, so not there either.
  hiddenOn(n: Notice, path: string): boolean {
    if (n.kind === 'live') {
      return path === '/' || path.startsWith('/kollegiet');
    }
    return fromKollegiet(n) ? path.startsWith('/kollegiet') : path === '/aktuelt';
  }
}

function fromKollegiet(n: Notice): boolean {
  return n.kind !== 'maker' && n.kind !== 'news' && n.kind !== 'proposal';
}
