import {Component, computed, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DatePipe, NgTemplateOutlet} from '@angular/common';
import {FormControl, FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatMenuModule} from '@angular/material/menu';
import {MatSelectModule} from '@angular/material/select';
import {
  KEvent, POST_MAX, PostThread, Rsvp, rsvpCounts, threads,
} from '../../interfaces/kollegiet';
import {EventFields, HideableCollection, KollegietService} from '../../services/kollegiet.service';
import {AuthService} from '../../services/auth.service';
import {LeagueService} from '../../services/league.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {millis} from '../../time';
import {TranslatePipe} from '../../translate.pipe';
import {Confirm} from '../confirm-dialog/confirm-dialog.component';
import {BadgeDialogComponent, BadgeResult, EventDialogComponent, EventDialogData, PollDialogComponent, PollResult} from './dialogs';
import {KitchenChipComponent} from './kitchen-chip.component';
import {PollCardComponent} from './poll-card.component';

// Posts from Kollegiet itself (old result and achievement posts from ops/league.js): not on the
// board, the results are pinned and achievements are on the kitchens' profiles.
const SYSTEM = 'kollegiet';

// The board, a pin board with fixed places: high-fives and badges across the top; under them posts
// with the composer on top, events, and votes and results.
@Component({
  selector: 'app-board',
  imports: [DatePipe, NgTemplateOutlet, FormsModule, ReactiveFormsModule, MatButtonModule, MatButtonToggleModule, MatCardModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatMenuModule, MatSelectModule, TranslatePipe, KitchenChipComponent, PollCardComponent],
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss',
})
export class BoardComponent {
  protected readonly kollegiet = inject(KollegietService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly i18n = inject(TranslateService);
  private readonly league = inject(LeagueService);

  private readonly posts = toSignal(this.kollegiet.posts$, {initialValue: []});
  private readonly allEvents = toSignal(this.kollegiet.events$, {initialValue: []});
  private readonly kudos = toSignal(this.kollegiet.kudos$, {initialValue: []});
  private readonly polls = toSignal(this.kollegiet.polls$, {initialValue: []});

  protected readonly me = computed(() => this.auth.membership()?.kitchenId ?? '');
  protected readonly canManage = this.auth.canManage;
  protected readonly postMax = POST_MAX;
  // Form controls, so clearing after a send always reaches the field.
  protected readonly textControl = new FormControl('', {nonNullable: true});
  protected readonly text = toSignal(this.textControl.valueChanges, {initialValue: ''});
  // '' is all kitchens.
  protected readonly to = signal('');
  protected readonly replyTo = signal<string | null>(null);
  protected readonly replyControl = new FormControl('', {nonNullable: true});
  protected readonly reply = toSignal(this.replyControl.valueChanges, {initialValue: ''});
  protected readonly others = computed(() => this.kollegiet.cards().filter(c => c.id !== this.me()));

  // Events for this kitchen (everyone's, or it is invited, or its own), soonest first.
  protected readonly events = computed(() => this.allEvents()
    .filter(e => e.invited === 'all' || e.kitchenId === this.me() || e.invited.includes(this.me()))
    .filter(e => millis(e.endsAt) > Date.now())
    .sort((a, b) => millis(a.startsAt) - millis(b.startsAt)));
  // Pinned above the composer: open votes, closing soonest first, then results from the last three days.
  protected readonly openPolls = computed(() => this.polls()
    .filter(p => !p.result || millis(p.closesAt) > Date.now() - 3 * 864e5)
    .sort((a, b) => Number(!!a.result) - Number(!!b.result)
      || (a.result ? millis(b.closesAt) - millis(a.closesAt) : millis(a.closesAt) - millis(b.closesAt))));

  // Pinned too: battles won in the last three days.
  protected readonly recentWins = computed(() => {
    const now = this.league.now();
    return this.league.battles()
      .filter(b => b.result?.winners.length && b.participants.length > 1 && millis(b.to) > now - 3 * 864e5)
      .sort((a, b) => millis(b.to) - millis(a.to));
  });
  // Open votes as cards; decided ones as a line, like a battle won.
  protected readonly livePolls = computed(() => this.openPolls().filter(p => !p.result));
  protected readonly decidedPolls = computed(() => this.openPolls().filter(p => p.result?.winners.length));
  // The newest high-fives and badges, as a row of stickers; the rest are on the kitchens' profiles.
  protected readonly recentKudos = computed(() => this.kudos().slice(0, 20));

  protected readonly feed = computed<PostThread[]>(() => threads(this.posts().filter(p => p.kitchenId !== SYSTEM))
    .map(t => ({t, at: Math.max(millis(t.post.createdAt), ...t.replies.map(r => millis(r.createdAt)))}))
    .sort((a, b) => b.at - a.at).map(x => x.t));

  protected rsvpCounts = rsvpCounts;

  protected send() {
    const text = this.textControl.value.trim();
    if (!text) {
      return;
    }
    this.textControl.setValue('');
    this.kollegiet.post(text, {to: this.to() || null}).catch(err => {
      this.textControl.setValue(text);
      this.tooSoon(err);
    });
  }

  protected sendReply(parentId: string) {
    const text = this.replyControl.value.trim();
    if (!text) {
      return;
    }
    this.replyControl.setValue('');
    this.replyTo.set(null);
    this.kollegiet.post(text, {parentId}).catch(err => {
      this.replyControl.setValue(text);
      this.replyTo.set(parentId);
      this.tooSoon(err);
    });
  }

  // The rules allow one post per 30 seconds per kitchen.
  private tooSoon(err: unknown) {
    this.notify.info(String(err).includes('permission') ? this.i18n.t('KOL_TOO_SOON') : String(err));
  }

  protected newEvent(event: KEvent | null = null) {
    this.dialog.open<EventDialogComponent, EventDialogData, EventFields>(EventDialogComponent, {width: '480px', maxWidth: '94vw', data: {event}})
      .afterClosed().subscribe(fields => {
        if (fields) {
          (event ? this.kollegiet.updateEvent(event, fields) : this.kollegiet.createEvent(fields)).catch(this.notify.error);
        }
      });
  }

  protected newPoll() {
    this.dialog.open<PollDialogComponent, unknown, PollResult>(PollDialogComponent, {width: '440px', maxWidth: '94vw'})
      .afterClosed().subscribe(p => {
        if (p) {
          this.kollegiet.createPoll(p.title, p.opensAt, p.closesAt)
            .catch(() => this.notify.info(this.i18n.t('KOL_POLL_ONE_A_MONTH')));
        }
      });
  }

  // A high-five or a badge for any kitchen, from the top of the board.
  protected giveKudos() {
    this.dialog.open<BadgeDialogComponent, string | null, BadgeResult>(BadgeDialogComponent, {width: '480px', maxWidth: '94vw', data: null})
      .afterClosed().subscribe(r => {
        if (!r) {
          return;
        }
        const name = this.kollegiet.card(r.to).name;
        if (r.badge) {
          this.kollegiet.giveBadge(r.to, r.badge, r.reason).then(
            () => this.notify.info(`${this.i18n.t('KOL_BADGE_ICON_' + r.badge)} ${this.i18n.t('KOL_BADGE_SENT')} ${name}`), this.notify.error);
        } else {
          this.kollegiet.highfive(r.to).then(
            () => this.notify.info(`🙌 ${this.i18n.t('KOL_HIGHFIVE_SENT')} ${name}`),
            () => this.notify.info(this.i18n.t('KOL_HIGHFIVE_DONE')));
        }
      });
  }

  protected answer(e: KEvent, answer: Rsvp) {
    this.kollegiet.rsvp(e, e.rsvp?.[this.me()] === answer ? null : answer).catch(this.notify.error);
  }

  protected recent(createdAt: {toMillis(): number} | null | undefined) {
    return Date.now() - millis(createdAt as never) < 5 * 60e3;
  }

  // A kitchen's managers hide its own things; nobody else moderates (not the maker either).
  protected mayHide(authorKitchenId: string) {
    return this.canManage() && authorKitchenId === this.me();
  }

  protected async remove(collection: HideableCollection, item: {id: string, createdAt?: unknown}, author: string) {
    const own = author === this.me() && this.recent(item.createdAt as never);
    const ok = await this.confirm.ask({title: this.i18n.t(own ? 'KOL_TAKE_BACK' : 'KOL_HIDE'),
      message: this.i18n.t(own ? 'KOL_TAKE_BACK_TEXT' : 'KOL_HIDE_TEXT'), confirm: this.i18n.t(own ? 'KOL_TAKE_BACK' : 'KOL_HIDE'), danger: true});
    if (ok) {
      (own ? this.kollegiet.takeBack(collection, item.id) : this.kollegiet.hide(collection, item, author)).catch(this.notify.error);
    }
  }

}
