import {Component, computed, inject, input} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {RouterLink} from '@angular/router';
import {switchMap} from 'rxjs';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {Battle, scoreboard} from '../../interfaces/kollegiet';
import {AuthService} from '../../services/auth.service';
import {KollegietService} from '../../services/kollegiet.service';
import {LeagueService} from '../../services/league.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {KitchenChipComponent} from './kitchen-chip.component';
import {liveBoard} from './live-board';

// One live battle on the buy page: the standings in a line, a pop when a kitchen moves, and the
// gym counter. Only for kitchens in the battle, so only their tablets listen.
@Component({
  selector: 'app-battle-ticker',
  imports: [RouterLink, MatButtonModule, MatIconModule, KitchenChipComponent],
  template: `
    <div class="ticker">
      <a class="title" [routerLink]="['/kollegiet/battle', battle().id]">
        <mat-icon>{{ icon() }}</mat-icon>
        <b>{{ battle().title }}</b>
      </a>
      <ol class="rows">
        @for (r of rows(); track r.kitchenId) {
          <li [class.mine]="r.kitchenId === me()" [class.bump]="live.bumped().has(r.kitchenId)">
            <span class="rank">{{ r.rank === 1 && r.score > 0 ? '🏆' : r.rank }}</span>
            <app-kitchen-chip [kitchenId]="r.kitchenId" />
            <b class="score">{{ r.score }}{{ battle().metric === 'plantMeals' ? ' %' : '' }}</b>
          </li>
        }
      </ol>
      @for (x of live.bumps(); track x.at + x.kitchenId) {
        @if (x.kitchenId !== me()) {
          <span class="toast">{{ kollegiet.card(x.kitchenId).emoji }} +{{ x.n }}</span>
        }
      }
      @if (battle().metric === 'gym') {
        <button mat-flat-button class="gym" (click)="gym()"><mat-icon>fitness_center</mat-icon> +1</button>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .ticker { display: flex; align-items: center; gap: 12px; padding: 4px 8px 4px 12px; border-radius: 14px; min-height: 40px; box-sizing: border-box;
      background: var(--mat-sys-surface-container); border: 1px solid var(--mat-sys-tertiary); min-width: 0; }
    .title { display: flex; align-items: center; gap: 6px; color: inherit; text-decoration: none; white-space: nowrap; min-width: 0; flex: 0 1 auto; }
    .title b { overflow: hidden; text-overflow: ellipsis; }
    .title mat-icon { color: var(--mat-sys-tertiary); }
    .rows { list-style: none; margin: 0; padding: 0; display: flex; gap: 6px; overflow-x: auto; min-width: 0; flex: 1; --chip-size: 24px; }
    li { display: flex; align-items: center; gap: 6px; padding: 2px 10px 2px 4px; border-radius: 16px; white-space: nowrap;
      background: var(--mat-sys-surface-container-high); transition: background-color 300ms; }
    li.mine { background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); }
    li.bump { background: var(--mat-sys-tertiary); color: var(--mat-sys-on-tertiary); }
    .rank { font: var(--mat-sys-label-large); min-width: 1.4em; text-align: center; }
    .score { font-variant-numeric: tabular-nums; }
    .toast { flex: none; padding: 4px 12px; border-radius: 14px; background: var(--mat-sys-tertiary); color: var(--mat-sys-on-tertiary);
      font: var(--mat-sys-label-large); animation: pop 400ms ease-out; }
    .gym { flex: none; }
    @keyframes pop { 0% { transform: scale(0.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
    .rows { scrollbar-width: none; }
    @media (max-width: 760px) { .title b { display: none; } .ticker { gap: 8px; } }
  `,
})
export class BattleTickerComponent {
  private readonly league = inject(LeagueService);
  protected readonly kollegiet = inject(KollegietService);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(TranslateService);
  readonly battle = input.required<Battle>();

  private readonly id = computed(() => this.battle().id);
  private readonly tallies = toSignal(toObservable(this.id).pipe(switchMap(id => this.league.tallies(id))), {initialValue: null});
  protected readonly rows = computed(() => scoreboard(this.battle(), this.tallies() ?? [], this.league.now()));
  protected readonly live = liveBoard(this.rows, computed(() => this.tallies() ? this.id() : ''));
  protected readonly me = computed(() => this.auth.membership()?.kitchenId ?? '');
  protected readonly icon = computed(() => LeagueService.metricIcon(this.battle().metric));

  protected gym() {
    this.league.gym(this.battle(), 1).catch(() => this.notify.info(this.i18n.t('KOL_GYM_WAIT')));
  }
}
