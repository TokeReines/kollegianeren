import {Component, computed, input, inject} from '@angular/core';
import {MatMenuModule} from '@angular/material/menu';
import {KEvent, Rsvp} from '../../interfaces/kollegiet';
import {TranslatePipe} from '../../translate.pipe';
import {KitchenChipComponent} from './kitchen-chip.component';
import {UsageService} from '../../services/usage.service';

// Who is coming to an event: the faces of the kitchens coming, and how many; a tap (tablets have
// no hover) opens the list by name, also who said maybe, and for the host who said no.
@Component({
  selector: 'app-who-is-coming',
  imports: [MatMenuModule, TranslatePipe, KitchenChipComponent],
  template: `
    <button type="button" class="who" [matMenuTriggerFor]="list" (menuOpened)="usage.act('who-is-coming')" [disabled]="!yes().length && !maybe().length && !(host() && no().length)"
            [attr.aria-label]="'KOL_WHO_COMING' | translate">
      @if (yes().length) {
        <span class="faces">
          @for (k of yes().slice(0, 5); track k) { <app-kitchen-chip [kitchenId]="k" [iconOnly]="true" /> }
          @if (yes().length > 5) { <span class="more">+{{ yes().length - 5 }}</span> }
        </span>
      }
      <span class="count">{{ yes().length }} {{ (yes().length === 1 ? "KOL_RSVP_COMING_ONE" : "KOL_RSVP_COMING") | translate }}@if (maybe().length) { · {{ maybe().length }} {{ "KOL_RSVP_MAYBE_COUNT" | translate }}}</span>
    </button>
    <mat-menu #list="matMenu" xPosition="after">
      @for (g of groups(); track g.answer) {
        <div class="group">{{ "KOL_WHO_" + g.answer | translate }} ({{ g.kitchens.length }})</div>
        @for (k of g.kitchens; track k) {
          <div class="row"><app-kitchen-chip [kitchenId]="k" /></div>
        }
      }
    </mat-menu>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .who {
      display: inline-flex; align-items: center; gap: 8px; max-width: 100%; min-height: 36px;
      padding: 2px 10px 2px 4px; border: none; border-radius: 18px; background: none;
      color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); cursor: pointer; text-align: left;
    }
    .who:not(:disabled):hover { background: var(--mat-sys-surface-container-high); }
    .who:disabled { cursor: default; padding-left: 0; }
    .faces { display: inline-flex; align-items: center; flex: none; --chip-size: 28px; }
    .faces app-kitchen-chip + app-kitchen-chip { margin-left: -8px; }
    .more { margin-left: 4px; font: var(--mat-sys-label-medium); color: var(--mat-sys-on-surface); }
    .count { min-width: 0; }
    .group { padding: 10px 16px 4px; font: var(--mat-sys-label-medium); color: var(--mat-sys-on-surface-variant); }
    .row { padding: 6px 16px; --chip-size: 28px; }
  `,
})
export class WhoIsComingComponent {
  protected readonly usage = inject(UsageService);
  readonly event = input.required<Pick<KEvent, 'rsvp'>>();
  // The kitchen that made it also sees who said no.
  readonly host = input(false);

  private answered(a: Rsvp) {
    return Object.entries(this.event().rsvp ?? {}).filter(([, x]) => x === a).map(([k]) => k);
  }

  protected readonly yes = computed(() => this.answered('yes'));
  protected readonly maybe = computed(() => this.answered('maybe'));
  protected readonly no = computed(() => this.answered('no'));
  protected readonly groups = computed(() => [
    {answer: 'yes', kitchens: this.yes()},
    {answer: 'maybe', kitchens: this.maybe()},
    ...(this.host() ? [{answer: 'no', kitchens: this.no()}] : []),
  ].filter(g => g.kitchens.length));
}
