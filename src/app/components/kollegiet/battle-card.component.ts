import {Component, computed, inject, input} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {RouterLink} from '@angular/router';
import {switchMap} from 'rxjs';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {Battle, battleState, isInvited, scoreboard} from '../../interfaces/kollegiet';
import {AuthService} from '../../services/auth.service';
import {LeagueService} from '../../services/league.service';
import {MakerService} from '../../services/maker.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {KitchenChipComponent} from './kitchen-chip.component';

// One battle: what is counted, when, the live scoreboard, and joining or tapping the gym counter.
@Component({
  selector: 'app-battle-card',
  imports: [DatePipe, RouterLink, MatButtonModule, MatCardModule, MatIconModule, TranslatePipe, KitchenChipComponent],
  template: `
    <mat-card appearance="outlined" class="battle" [class.live]="state() === 'live'" [id]="'battle-' + battle().id">
      <header>
        <mat-icon class="metric">{{ icon() }}</mat-icon>
        <div class="head">
          <b>{{ battle().title }}</b>
          <span class="hint">
            {{ "KOL_METRIC_" + battle().metric | translate }} ·
            {{ battle().from.toDate() | date:'EEE d/M HH:mm' }} {{ "KOL_UNTIL" | translate }} {{ battle().to.toDate() | date:'EEE d/M HH:mm' }}
          </span>
        </div>
        <span class="state" [attr.data-state]="state()">{{ "KOL_STATE_" + state() | translate }}</span>
      </header>
      <ol class="rows">
        @for (r of rows(); track r.kitchenId) {
          <li [class.mine]="r.kitchenId === me()" [class.first]="r.rank === 1 && r.score > 0">
            <span class="rank">{{ r.rank === 1 && r.score > 0 ? '🏆' : r.rank }}</span>
            <app-kitchen-chip [kitchenId]="r.kitchenId" />
            @if (r.burst > 0 && state() === 'live') {
              <span class="burst">+{{ r.burst }} {{ "KOL_BURST" | translate }}</span>
            }
            <span class="score">{{ r.score }}{{ battle().metric === 'plantMeals' ? ' %' : '' }}</span>
          </li>
        }
      </ol>
      @if (battle().result) {
        <p class="hint">{{ "KOL_SETTLED" | translate }}</p>
      }
      <div class="actions">
        @if (canJoin()) {
          <button mat-flat-button (click)="join()"><mat-icon>sports_kabaddi</mat-icon> {{ "KOL_JOIN" | translate }}</button>
        }
        @if (battle().metric === 'gym' && joined() && state() === 'live') {
          <button mat-flat-button class="gym" (click)="gym(1)"><mat-icon>fitness_center</mat-icon> +1 {{ "KOL_GYM" | translate }}</button>
          <button mat-button (click)="gym(-1)">-1</button>
        }
        <span class="spacer"></span>
        @if (state() !== 'upcoming') {
          <a mat-button [routerLink]="['/kollegiet/battle', battle().id]"><mat-icon>tv</mat-icon> {{ "KOL_BIG_SCREEN" | translate }}</a>
        }
        @if ((battle().kitchenId === me() && state() === 'upcoming') || isAdmin()) {
          <button mat-button (click)="callOff()"><mat-icon>close</mat-icon> {{ "KOL_CALL_OFF" | translate }}</button>
        }
      </div>
    </mat-card>
  `,
  styles: `
    .battle { padding: 12px 12px 8px 16px; display: flex; flex-direction: column; gap: 8px; }
    .battle.live { border-color: var(--mat-sys-tertiary); box-shadow: inset 0 0 0 1px var(--mat-sys-tertiary); }
    header { display: flex; align-items: center; gap: 12px; }
    .metric { color: var(--mat-sys-tertiary); }
    .head { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .hint { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); margin: 0; }
    .state { font: var(--mat-sys-label-medium); padding: 2px 10px; border-radius: 12px; background: var(--mat-sys-surface-container-high); }
    .state[data-state=live] { background: var(--mat-sys-tertiary); color: var(--mat-sys-on-tertiary); }
    .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 10px; }
    li.mine { background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); }
    .rank { width: 28px; text-align: center; font: var(--mat-sys-title-medium); }
    .burst { font: var(--mat-sys-label-medium); color: var(--mat-sys-tertiary); }
    .score { margin-left: auto; font: var(--mat-sys-title-large); font-variant-numeric: tabular-nums; }
    li.first .score { font-weight: 700; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .spacer { flex: 1; }
    .gym { min-width: 140px; }
  `,
})
export class BattleCardComponent {
  private readonly league = inject(LeagueService);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(TranslateService);
  private readonly auth = inject(AuthService);
  protected readonly isAdmin = inject(MakerService).isAdmin;
  readonly battle = input.required<Battle>();

  private readonly tallies = toSignal(toObservable(computed(() => this.battle().id)).pipe(switchMap(id => this.league.tallies(id))), {initialValue: []});
  protected readonly me = computed(() => this.auth.membership()?.kitchenId ?? '');
  protected readonly state = computed(() => battleState(this.battle(), this.league.now()));
  protected readonly rows = computed(() => scoreboard(this.battle(), this.tallies(), this.league.now()));
  protected readonly joined = computed(() => this.battle().participants.includes(this.me()));
  protected readonly canJoin = computed(() => !this.joined() && this.state() !== 'ended' && isInvited(this.battle(), this.me()));
  protected readonly icon = computed(() => LeagueService.metricIcon(this.battle().metric));

  protected join() {
    if (this.league.myLive().length >= 3 && this.state() === 'live') {
      this.notify.info(this.i18n.t('KOL_MAX_BATTLES'));
      return;
    }
    this.league.join(this.battle()).catch(this.notify.error);
  }

  protected gym(n: 1 | -1) {
    this.league.gym(this.battle(), n).catch(() => this.notify.info(this.i18n.t('KOL_GYM_WAIT')));
  }

  protected callOff() {
    this.league.callOff(this.battle()).catch(this.notify.error);
  }
}
