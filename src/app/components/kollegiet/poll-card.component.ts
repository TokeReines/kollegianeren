import {Component, computed, inject, input} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {switchMap} from 'rxjs';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatSelectModule} from '@angular/material/select';
import {Poll} from '../../interfaces/kollegiet';
import {KollegietService} from '../../services/kollegiet.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {millis} from '../../time';
import {TranslatePipe} from '../../translate.pipe';
import {Confirm} from '../confirm-dialog/confirm-dialog.component';
import {KitchenChipComponent} from './kitchen-chip.component';

// A vote: pick a kitchen, change it until it closes. Secret: only your own choice is shown, and
// the winner once ops/league.js has counted.
@Component({
  selector: 'app-poll-card',
  imports: [DatePipe, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatSelectModule, TranslatePipe, KitchenChipComponent],
  template: `
    <mat-card appearance="outlined" class="poll" [class.paper]="paper()">
      <header>
        <mat-icon class="icon">how_to_vote</mat-icon>
        <div class="head">
          <b>{{ poll().title }}</b>
          <span class="hint">
            {{ "KOL_POLL_BY" | translate }} <app-kitchen-chip [kitchenId]="poll().kitchenId" />
            · {{ (open() ? "KOL_POLL_CLOSES" : "KOL_POLL_CLOSED") | translate }} {{ poll().closesAt.toDate() | date:'EEE d/M HH:mm' }}
          </span>
        </div>
      </header>
      @if (poll().result; as r) {
        <div class="result">
          🏆 @for (w of r.winners; track w) { <app-kitchen-chip [kitchenId]="w" /> }
          <span class="hint">{{ r.votes[r.winners[0]] ?? 0 }} {{ "KOL_VOTES" | translate }}</span>
        </div>
      } @else if (open()) {
        <div class="vote">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ "KOL_POLL_YOUR_VOTE" | translate }}</mat-label>
            <mat-select [value]="mine()" (selectionChange)="vote($event.value)" [attr.aria-label]="poll().title">
              <mat-option [value]="null">{{ "KOL_POLL_NO_VOTE" | translate }}</mat-option>
              @for (k of others(); track k.id) {
                <mat-option [value]="k.id"><app-kitchen-chip [kitchenId]="k.id" /></mat-option>
              }
            </mat-select>
          </mat-form-field>
          <span class="hint">{{ (paper() ? "KOL_POLL_SECRET_SHORT" : "KOL_POLL_SECRET") | translate }}</span>
        </div>
        @if (own()) {
          <div class="own">
            <button mat-button (click)="close(false)"><mat-icon>how_to_vote</mat-icon> {{ "KOL_POLL_CLOSE_NOW" | translate }}</button>
            <button mat-button (click)="close(true)"><mat-icon>block</mat-icon> {{ "KOL_POLL_CANCEL" | translate }}</button>
          </div>
        }
      } @else {
        <p class="hint">{{ "KOL_POLL_COUNTING" | translate }}</p>
      }
    </mat-card>
  `,
  styles: `
    .poll { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; border-color: var(--mat-sys-tertiary); }
    header { display: flex; align-items: center; gap: 12px; }
    .icon { color: var(--mat-sys-tertiary); }
    .head { display: flex; flex-direction: column; min-width: 0; }
    .hint { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); margin: 0; --chip-size: 20px; }
    .result { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 20px; }
    .vote { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .vote mat-form-field { width: 260px; max-width: 100%; }
    .vote .hint { flex: 1; min-width: 180px; }
    /* On the wall: the ballot paper is the card. */
    .poll.paper { padding: 0; border: none; background: transparent; box-shadow: none; }
    .poll.paper header { align-items: flex-start; }
    .poll.paper b { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .poll.paper .vote mat-form-field { width: 100%; }
    .poll.paper .vote .hint { min-width: 0; }
    .own { display: flex; flex-wrap: wrap; gap: 0 4px; margin: -4px 0 -8px -12px; }
  `,
})
export class PollCardComponent {
  private readonly kollegiet = inject(KollegietService);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly i18n = inject(TranslateService);
  readonly poll = input.required<Poll>();
  // On the board's wall, inside a ballot paper.
  readonly paper = input(false);
  protected readonly mine = toSignal(toObservable(this.poll).pipe(switchMap(p => this.kollegiet.myBallot(p))), {initialValue: null});
  protected readonly open = computed(() => Date.now() >= millis(this.poll().opensAt) && Date.now() < millis(this.poll().closesAt));
  protected readonly others = computed(() => this.kollegiet.cards().filter(c => c.id !== this.kollegiet.kitchenId));

  // The kitchen's own poll: it may end it early.
  protected readonly own = computed(() => this.poll().kitchenId === this.kollegiet.kitchenId);

  protected async close(cancel: boolean) {
    const key = cancel ? 'KOL_POLL_CANCEL' : 'KOL_POLL_CLOSE_NOW';
    if (await this.confirm.ask({title: this.i18n.t(key), message: this.i18n.t(key + '_TEXT'), confirm: this.i18n.t(key), danger: cancel})) {
      this.kollegiet.closePoll(this.poll(), cancel).catch(this.notify.error);
    }
  }

  protected vote(choice: string | null | undefined) {
    this.kollegiet.vote(this.poll(), choice ?? null).catch(this.notify.error);
  }
}
