import {Component, computed, inject, input} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {switchMap} from 'rxjs';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatSelectModule} from '@angular/material/select';
import {Poll} from '../../interfaces/kollegiet';
import {KollegietService} from '../../services/kollegiet.service';
import {Notify} from '../../services/notify.service';
import {millis} from '../../time';
import {TranslatePipe} from '../../translate.pipe';
import {KitchenChipComponent} from './kitchen-chip.component';

// A vote: pick a kitchen, change it until it closes. Secret: only your own choice is shown, and
// the winner once ops/league.js has counted.
@Component({
  selector: 'app-poll-card',
  imports: [DatePipe, MatCardModule, MatFormFieldModule, MatIconModule, MatSelectModule, TranslatePipe, KitchenChipComponent],
  template: `
    <mat-card appearance="outlined" class="poll">
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
          <span class="hint">{{ "KOL_POLL_SECRET" | translate }}</span>
        </div>
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
  `,
})
export class PollCardComponent {
  private readonly kollegiet = inject(KollegietService);
  private readonly notify = inject(Notify);
  readonly poll = input.required<Poll>();
  protected readonly mine = toSignal(toObservable(this.poll).pipe(switchMap(p => this.kollegiet.myBallot(p))), {initialValue: null});
  protected readonly open = computed(() => Date.now() >= millis(this.poll().opensAt) && Date.now() < millis(this.poll().closesAt));
  protected readonly others = computed(() => this.kollegiet.cards().filter(c => c.id !== this.kollegiet.kitchenId));

  protected vote(choice: string | null | undefined) {
    this.kollegiet.vote(this.poll(), choice ?? null).catch(this.notify.error);
  }
}
