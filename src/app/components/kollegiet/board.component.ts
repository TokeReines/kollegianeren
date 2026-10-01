import {Component, ElementRef, TemplateRef, computed, inject, signal, viewChild} from '@angular/core';
import {takeUntilDestroyed, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe, NgTemplateOutlet} from '@angular/common';
import {ActivatedRoute} from '@angular/router';
import {FormControl, FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatMenuModule} from '@angular/material/menu';
import {MatSelectModule} from '@angular/material/select';
import {
  Battle, KEvent, Kudos, POST_MAX, Poll, Post, PostThread, Rsvp, isLiveNow, threads,
} from '../../interfaces/kollegiet';
import {EventFields, HideableCollection, KollegietService} from '../../services/kollegiet.service';
import {AuthService} from '../../services/auth.service';
import {LeagueService} from '../../services/league.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {millis} from '../../time';
import {TranslatePipe} from '../../translate.pipe';
import {Confirm} from '../confirm-dialog/confirm-dialog.component';
import {
  BadgeDialogComponent, BadgeResult, EventDialogComponent, EventDialogData, LiveCallDialogComponent, LiveCallResult, PollDialogComponent, PollResult,
} from './dialogs';
import {KitchenChipComponent} from './kitchen-chip.component';
import {PollCardComponent} from './poll-card.component';
import {WhoIsComingComponent} from './who-is-coming.component';

// Posts from Kollegiet itself (old result and achievement posts from ops/league.js): not on the
// board, the results are stickers and achievements are on the kitchens' profiles.
const SYSTEM = 'kollegiet';
// Flyers shown before "+N more".
const EVENTS_SHOWN = 4;

// A sticker in the top row: a high-five or badge, or a battle or vote just won.
export type Sticker =
  {kind: 'kudos', at: number, kudos: Kudos} |
  {kind: 'battle', at: number, battle: Battle} |
  {kind: 'poll', at: number, poll: Poll};

// A post on the wall: the thread, whether there is something new in it, the kitchens talking
// in it, and its size: a single post is small, a conversation tall, a big one two papers wide.
interface Note {
  thread: PostThread;
  fresh: boolean;
  kitchens: string[];
  size: 'small' | 'tall' | 'big';
  // The newest replies, shown on the post-it, oldest first.
  latest: Post[];
}
const BIG_REPLIES = 5;
const BIG_KITCHENS = 4;

// The board, a pin board (docs/kollegiet.md). Across the top, loud: high-fives, badges and wins as
// stickers. Under it one wall of papers, in a fixed order: the note to write on, events as flyers,
// open votes as ballots, then the posts as post-its in the writer's colour. Space follows how many
// there are of each, and a conversation takes more than a single post. A post-it opens with its
// replies. Nothing is tilted: rotated text blurs.
@Component({
  selector: 'app-board',
  imports: [DatePipe, NgTemplateOutlet, FormsModule, ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatMenuModule, MatSelectModule, TranslatePipe, KitchenChipComponent, PollCardComponent, WhoIsComingComponent],
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
  protected readonly replyControl = new FormControl('', {nonNullable: true});
  protected readonly reply = toSignal(this.replyControl.valueChanges, {initialValue: ''});
  protected readonly others = computed(() => this.kollegiet.cards().filter(c => c.id !== this.me()));

  private readonly composeTpl = viewChild.required<TemplateRef<unknown>>('compose');
  private readonly noteTpl = viewChild.required<TemplateRef<unknown>>('note');
  private composeRef: MatDialogRef<unknown> | null = null;
  private noteRef: MatDialogRef<unknown> | null = null;
  protected readonly openId = signal<string | null>(null);

  // Events for this kitchen (everyone's, or it is invited, or its own), soonest first. The first
  // few as flyers; all of them after "+N more", or when the strip links to one further down.
  protected readonly events = computed(() => this.allEvents()
    .filter(e => e.invited === 'all' || e.kitchenId === this.me() || e.invited.includes(this.me()))
    .filter(e => millis(e.endsAt) > this.now())
    // A live call first, then the soonest.
    .sort((a, b) => Number(this.isLive(b)) - Number(this.isLive(a)) || millis(a.startsAt) - millis(b.startsAt)));
  protected readonly allShown = signal(false);
  protected readonly shownEvents = computed(() => this.allShown() ? this.events() : this.events().slice(0, EVENTS_SHOWN));
  protected readonly moreEvents = computed(() => this.events().length - this.shownEvents().length);

  // Open votes as ballots on the wall.
  protected readonly livePolls = computed(() => this.polls()
    .filter(p => !p.result)
    .sort((a, b) => millis(a.closesAt) - millis(b.closesAt)));

  // Stickers: the newest high-fives and badges, and battles and votes won in the last three days.
  protected readonly stickers = computed<Sticker[]>(() => {
    const now = this.league.now();
    const since = now - 3 * 864e5;
    const at = (t: {toMillis(): number} | null | undefined) => t ? millis(t as never) : Date.now();
    return [
      ...this.kudos().slice(0, 20).map(kudos => ({kind: 'kudos' as const, at: at(kudos.createdAt), kudos})),
      ...this.league.battles()
        .filter(b => b.result?.winners.length && b.participants.length > 1 && millis(b.to) > since)
        .map(battle => ({kind: 'battle' as const, at: millis(battle.to), battle})),
      ...this.polls()
        .filter(p => p.result?.winners.length && millis(p.closesAt) > since)
        .map(poll => ({kind: 'poll' as const, at: millis(poll.closesAt), poll})),
    ].sort((a, b) => b.at - a.at);
  });

  // When this kitchen last looked, before this visit: what counts as new on a post-it.
  private readonly seenBefore = this.kollegiet.seenBefore;
  protected readonly notes = computed<Note[]>(() => threads(this.posts().filter(p => p.kitchenId !== SYSTEM))
    .map(thread => {
      const all = [thread.post, ...thread.replies];
      // Who is talking, the newest first, besides the one who wrote it.
      const kitchens = [...new Set([...thread.replies].reverse().map(r => r.kitchenId))].filter(k => k !== thread.post.kitchenId);
      const size: Note['size'] = !thread.replies.length ? 'small'
        : thread.replies.length >= BIG_REPLIES || kitchens.length >= BIG_KITCHENS ? 'big' : 'tall';
      return {
        thread,
        at: Math.max(...all.map(p => millis(p.createdAt))),
        fresh: all.some(p => p.kitchenId !== this.me() && millis(p.createdAt) > this.seenBefore()),
        kitchens,
        size,
        latest: thread.replies.slice(size === 'big' ? -4 : -2),
      };
    })
    .sort((a, b) => b.at - a.at));
  protected readonly openThread = computed(() => this.notes().find(n => n.thread.post.id === this.openId())?.thread ?? null);


  // What arrives while the board is open comes in with a short animation, instead of just being
  // there: a sticker slides in, a paper is pinned up. Not what is there when it opens.
  private readonly openedAt = Date.now();
  private readonly stickerRow = viewChild<ElementRef<HTMLElement>>('stickerRow');

  protected arrived(at: number | {toMillis(): number} | null | undefined) {
    const ms = typeof at === 'number' ? at : at ? millis(at as never) : Date.now();
    return ms > this.openedAt;
  }

  // Before giving one: straight to the start of the row, where it comes in, so it is seen arriving.
  private showNewSticker() {
    this.stickerRow()?.nativeElement.scrollTo({left: 0});
  }

  // After putting something up: once it is on the wall, bring it into view, so its arrival is seen
  // (a new note lands after the flyers and votes, maybe below the fold).
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private reveal(selector: string, tries = 10) {
    setTimeout(() => {
      const el = this.host.nativeElement.querySelector<HTMLElement>(selector);
      if (el) {
        el.scrollIntoView({behavior: 'smooth', block: 'nearest'});
      } else if (tries > 1) {
        this.reveal(selector, tries - 1);
      }
    }, 100);
  }

  constructor() {
    // The strip links to an event: show them all, so the flyer is there to scroll to.
    inject(ActivatedRoute).fragment.pipe(takeUntilDestroyed()).subscribe(f => {
      if (f?.startsWith('event-')) {
        this.allShown.set(true);
      }
    });
  }

  // A kitchen's colour, for its post-its.
  protected colour(kitchenId: string) {
    return this.kollegiet.card(kitchenId).colour;
  }

  protected openComposer() {
    this.composeRef = this.dialog.open(this.composeTpl(), {width: '520px', maxWidth: '94vw'});
  }

  protected send() {
    const text = this.textControl.value.trim();
    if (!text) {
      return;
    }
    this.textControl.setValue('');
    this.composeRef?.close();
    // The newest note is the first one on the wall.
    this.reveal('.wall .note.arrive');
    // Refused (too soon after the last one): the note comes back, open, with its text.
    this.kollegiet.post(text, {to: this.to() || null}).catch(err => {
      this.textControl.setValue(text);
      this.openComposer();
      this.tooSoon(err);
    });
  }

  protected openNote(id: string) {
    this.openId.set(id);
    this.replyControl.setValue('');
    this.noteRef = this.dialog.open(this.noteTpl(), {width: '560px', maxWidth: '94vw', autoFocus: false});
    this.noteRef.afterClosed().subscribe(() => this.openId.set(null));
  }

  protected sendReply(parentId: string) {
    const text = this.replyControl.value.trim();
    if (!text) {
      return;
    }
    this.replyControl.setValue('');
    this.kollegiet.post(text, {parentId}).catch(err => {
      this.replyControl.setValue(text);
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
          if (event) {
            this.kollegiet.updateEvent(event, fields).catch(this.notify.error);
          } else {
            const ref = this.kollegiet.createEvent(fields);
            ref.then(r => this.reveal(`#event-${r.id}`), this.notify.error);
          }
        }
      });
  }

  protected newPoll() {
    this.dialog.open<PollDialogComponent, unknown, PollResult>(PollDialogComponent, {width: '440px', maxWidth: '94vw'})
      .afterClosed().subscribe(p => {
        if (p) {
          this.reveal('.wall .ballot.arrive');
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
          this.showNewSticker();
          this.kollegiet.giveBadge(r.to, r.badge, r.reason).then(
            () => this.notify.info(`${this.i18n.t('KOL_BADGE_ICON_' + r.badge)} ${this.i18n.t('KOL_BADGE_SENT')} ${name}`), this.notify.error);
        } else {
          this.showNewSticker();
          this.kollegiet.highfive(r.to).then(
            () => this.notify.info(`🙌 ${this.i18n.t('KOL_HIGHFIVE_SENT')} ${name}`),
            () => this.notify.info(this.i18n.t('KOL_HIGHFIVE_DONE')));
        }
      });
  }

  protected isLive(e: KEvent) {
    return isLiveNow(e, this.now());
  }

  // The app's clock ticks once a minute; read the time itself too, so a call ended a moment ago is
  // gone at once (this runs again whenever the events change).
  private now() {
    return Math.max(this.league.now(), Date.now());
  }

  // "Kom over nu": one call per kitchen at a time; a new one once the last has ended.
  protected async liveCall() {
    const last = await this.kollegiet.myLastCall().catch(() => null);
    if (last && millis(last.endsAt) > Date.now()) {
      this.notify.info(this.i18n.t('KOL_LIVE_ALREADY'));
      return;
    }
    const data = {title: this.i18n.t('KOL_LIVE_DEFAULT'), place: this.kollegiet.card(this.me()).name};
    this.dialog.open<LiveCallDialogComponent, typeof data, LiveCallResult>(LiveCallDialogComponent, {width: '480px', maxWidth: '94vw', data})
      .afterClosed().subscribe(r => {
        if (r) {
          this.reveal('.wall .flyer.live');
          this.kollegiet.startLiveCall(r.title, r.place, r.hours).then(() => this.notify.info(`📣 ${this.i18n.t('KOL_LIVE_SENT')}`), this.notify.error);
        }
      });
  }

  protected async endLive(e: KEvent) {
    const ok = await this.confirm.ask({title: this.i18n.t('KOL_LIVE_END'), message: this.i18n.t('KOL_LIVE_END_TEXT'), confirm: this.i18n.t('KOL_LIVE_END')});
    if (ok && millis(e.endsAt) > Date.now()) {
      this.kollegiet.endLiveCall(e).catch(this.notify.error);
    }
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
      (own ? this.kollegiet.takeBack(collection, item.id) : this.kollegiet.hide(collection, item, author)).then(() => {
        if (item.id === this.openId()) {
          this.noteRef?.close();
        }
      }, this.notify.error);
    }
  }

}
