import {Component, computed, inject} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {TOO_MANY_BATTLES, battleState} from '../../interfaces/kollegiet';
import {BattleFields, LeagueService} from '../../services/league.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {millis} from '../../time';
import {TranslatePipe} from '../../translate.pipe';
import {BattleCardComponent} from './battle-card.component';
import {BattleDialogComponent, BattleDialogData} from './dialogs';

// Battles: live first, then coming up, then the last two weeks' results.
@Component({
  selector: 'app-battles',
  imports: [MatButtonModule, MatIconModule, TranslatePipe, BattleCardComponent],
  template: `
    <div class="battles">
      <div class="top">
        <p class="hint">{{ "KOL_BATTLES_INTRO" | translate }}</p>
        <button mat-flat-button (click)="challenge()"><mat-icon>sports_kabaddi</mat-icon> {{ "KOL_CHALLENGE" | translate }}</button>
      </div>
      @for (group of groups(); track group.state) {
        @if (group.battles.length) {
          <h2>{{ "KOL_GROUP_" + group.state | translate }}</h2>
          <div class="grid">
            @for (b of group.battles; track b.id) {
              <app-battle-card [battle]="b" />
            }
          </div>
        }
      }
      @if (!league.battles().length) {
        <p class="empty">{{ "KOL_BATTLES_EMPTY" | translate }}</p>
      }
    </div>
  `,
  styles: `
    .battles { padding-top: 16px; display: flex; flex-direction: column; gap: 12px; }
    .top { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .hint, .empty { color: var(--mat-sys-on-surface-variant); margin: 0; flex: 1; }
    h2 { margin: 8px 0 0; font: var(--mat-sys-title-medium); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
    @media (max-width: 760px) { .grid { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class BattlesComponent {
  protected readonly league = inject(LeagueService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(TranslateService);

  protected readonly groups = computed(() => {
    const now = this.league.now();
    const all = this.league.battles();
    const of = (state: string) => all.filter(b => battleState(b, now) === state);
    return [
      {state: 'live', battles: of('live')},
      {state: 'upcoming', battles: of('upcoming').sort((a, b) => millis(a.from) - millis(b.from))},
      {state: 'ended', battles: of('ended').filter(b => millis(b.to) > now - 14 * 864e5).sort((a, b) => millis(b.to) - millis(a.to))},
    ];
  });

  protected challenge(against: string | null = null) {
    this.dialog.open<BattleDialogComponent, BattleDialogData, BattleFields>(BattleDialogComponent, {width: '480px', maxWidth: '94vw', data: {against}})
      .afterClosed().subscribe(fields => {
        if (fields) {
          this.league.create(fields).catch(err => String(err).includes(TOO_MANY_BATTLES)
            ? this.notify.info(this.i18n.t('KOL_MAX_BATTLES')) : this.notify.error(err));
        }
      });
  }
}
