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
  KEvent, Kudos, POST_MAX, PostThread, Rsvp, rsvpCounts, threads,
} from '../../interfaces/kollegiet';
import {EventFields, HideableCollection, KollegietService} from '../../services/kollegiet.service';
import {AuthService} from '../../services/auth.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {millis} from '../../time';
import {TranslatePipe} from '../../translate.pipe';
import {Confirm} from '../confirm-dialog/confirm-dialog.component';
import {EventDialogComponent, EventDialogData, PollDialogComponent, PollResult} from './dialogs';
import {KitchenChipComponent} from './kitchen-chip.component';
import {PollCardComponent} from './poll-card.component';

type FeedItem = {kind: 'thread', at: number, thread: PostThread} | {kind: 'kudos', at: number, kudos: Kudos};

// The board: posts and replies, events with answers, open votes, and high-fives and badges as
// they are given. Newest activity first.
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

  private readonly posts = toSignal(this.kollegiet.posts$, {initialValue: []});
  private readonly kudos = toSignal(this.kollegiet.kudos$, {initialValue: []});
  private readonly allEvents = toSignal(this.kollegiet.events$, {initialValue: []});
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
  protected readonly openPolls = computed(() => this.polls().filter(p => !p.result || millis(p.closesAt) > Date.now() - 3 * 864e5));

  protected readonly feed = computed<FeedItem[]>(() => [
    ...threads(this.posts()).map(t => ({kind: 'thread' as const, thread: t,
      at: Math.max(millis(t.post.createdAt), ...t.replies.map(r => millis(r.createdAt)))})),
    ...this.kudos().map(k => ({kind: 'kudos' as const, kudos: k, at: millis(k.createdAt)})),
  ].sort((a, b) => b.at - a.at));

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
