import {Component, inject} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {BADGES} from '../../interfaces/kollegiet';
import {TranslatePipe} from '../../translate.pipe';

// Achievements by when they come: claimed by the tablet during a battle (LIVE_ACHIEVEMENTS, checked
// by the rules), when ops/league.js settles a battle, and in its morning run (--daily).
const GROUPS = [
  {key: 'LIVE', codes: ['firstBattle', 'drinks100', 'beer50', 'beer100', 'diners50', 'gym25']},
  {key: 'SETTLED', codes: ['firstWin']},
  {key: 'DAILY', codes: ['dinners10', 'dinners50', 'dinners100', 'plantMonth', 'firstOpenKitchen', 'highfives10']},
] as const;

// "Sådan får I dem": everything that can be on a kitchen's shelf and how to get it, with what this
// kitchen already has ticked off. What it says must match the rules and ops/league.js.
@Component({
  selector: 'app-shelf-guide',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ "KOL_GUIDE_TITLE" | translate }}</h2>
    <div mat-dialog-content class="guide">
      <h3>{{ "KOL_GUIDE_WON" | translate }}</h3>
      <div class="row"><span class="icon gold">🏆</span><span><b>{{ "KOL_GUIDE_WINS_NAME" | translate }}</b><br>{{ "KOL_GUIDE_WINS" | translate }}</span></div>
      <div class="row"><span class="icon gold">🗳️</span><span><b>{{ "KOL_GUIDE_TITLES_NAME" | translate }}</b><br>{{ "KOL_GUIDE_TITLES" | translate }}</span></div>

      <h3>{{ "KOL_GUIDE_GIVEN" | translate }}</h3>
      <div class="row"><span class="icon">🙌</span><span><b>{{ "KOL_GUIDE_HIGHFIVES_NAME" | translate }}</b><br>{{ "KOL_GUIDE_HIGHFIVES" | translate }}</span></div>
      <div class="row">
        <span class="icon">🏅</span>
        <span><b>{{ "KOL_GUIDE_BADGES_NAME" | translate }}</b><br>{{ "KOL_GUIDE_BADGES" | translate }}
          <span class="badges">
            @for (b of badges; track b) { <span class="badge">{{ "KOL_BADGE_ICON_" + b | translate }} {{ "KOL_BADGE_" + b | translate }}</span> }
          </span>
        </span>
      </div>

      @for (g of groups; track g.key) {
        <h3>{{ "KOL_GUIDE_" + g.key | translate }}</h3>
        @for (c of g.codes; track c) {
          <div class="row" [class.have]="has(c)">
            <span class="icon ach">{{ "KOL_ACH_ICON_" + c | translate }}</span>
            <span><b>{{ "KOL_ACH_" + c | translate }}</b><br>{{ "KOL_ACH_HOW_" + c | translate }}</span>
            @if (has(c)) {
              <span class="yours"><mat-icon>check_circle</mat-icon> {{ "KOL_GUIDE_YOURS" | translate }}</span>
            }
          </div>
        }
      }
    </div>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">{{ "CLOSE" | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .guide { display: flex; flex-direction: column; gap: 6px; padding-top: 4px; }
    h3 { margin: 14px 0 2px; font: var(--mat-sys-title-small); color: var(--mat-sys-on-surface-variant); }
    .row { display: flex; align-items: flex-start; gap: 12px; padding: 6px 8px; border-radius: 12px; }
    .row.have { background: var(--mat-sys-surface-container-high); }
    .icon { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; font-size: 22px;
      background: var(--mat-sys-tertiary-container); }
    .icon.ach { background: var(--mat-sys-secondary-container); }
    .icon.gold { background: linear-gradient(135deg, #ffe082, #ffb300); }
    .yours { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 4px; color: var(--mat-sys-primary);
      font: var(--mat-sys-label-medium); }
    .yours mat-icon { width: 18px; height: 18px; font-size: 18px; }
    .badges { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 6px; }
    .badge { padding: 2px 8px; border-radius: 10px; background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container); font: var(--mat-sys-label-medium); }
  `,
})
export class ShelfGuideComponent {
  // The achievements this kitchen has.
  private readonly mine = new Set(inject<string[]>(MAT_DIALOG_DATA));
  protected readonly groups = GROUPS;
  protected readonly badges = BADGES;

  protected has(code: string) {
    return this.mine.has(code);
  }
}
