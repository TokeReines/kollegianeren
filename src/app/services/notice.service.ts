import {Injectable, computed, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {Notice, kollegietNotices, sortNotices} from '../interfaces/kollegiet';
import {millis} from '../time';
import {AuthService} from './auth.service';
import {KollegietService} from './kollegiet.service';
import {LeagueService} from './league.service';
import {MakerService} from './maker.service';

// Everything waiting for the kitchen, most important first: a message from the maker, then what
// Kollegiet has for it (docs/kollegiet.md, Notifications). The strip under the top bar shows the
// first, the bell counts them.
@Injectable({providedIn: 'root'})
export class NoticeService {
  private readonly auth = inject(AuthService);
  private readonly kollegiet = inject(KollegietService);
  private readonly league = inject(LeagueService);

  private readonly unread = toSignal(inject(MakerService).unreadByKitchen$, {initialValue: []});
  private readonly events = toSignal(this.kollegiet.events$, {initialValue: []});
  private readonly kudos = toSignal(this.kollegiet.kudos$, {initialValue: []});
  private readonly seenAt = toSignal(this.kollegiet.seen$, {initialValue: Number.MAX_SAFE_INTEGER});

  readonly notices = computed<Notice[]>(() => {
    const kid = this.auth.membership()?.kitchenId;
    if (!kid) {
      return [];
    }
    const latest = this.unread()[0];
    const maker: Notice[] = latest ? [{kind: 'maker', from: null, text: latest.text, at: millis(latest.createdAt),
      link: {path: '/aktuelt', fragment: 'message'}}] : [];
    return sortNotices([...maker, ...kollegietNotices(kid, this.seenAt(), {
      events: this.events(), battles: this.league.battles(), kudos: this.kudos(),
    }, this.league.now())]);
  });

  readonly makerUnread = computed(() => this.unread().length);

  // New posts from other kitchens: the badge on the Kollegiet menu item.
  private readonly newPosts = toSignal(this.kollegiet.newPosts$, {initialValue: []});
  readonly kollegietBadge = computed(() => {
    const kid = this.auth.membership()?.kitchenId;
    return this.newPosts().filter(p => p.kitchenId !== kid).length
      + this.notices().filter(n => n.kind !== 'maker').length;
  });

  // "Not now" for everything from Kollegiet: the same as having looked.
  dismiss() {
    return this.kollegiet.markSeen();
  }
}
