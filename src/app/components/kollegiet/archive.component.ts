import {Component, computed, inject, resource, signal} from '@angular/core';
import {DatePipe} from '@angular/common';
import {collection, limit, orderBy, query} from 'firebase/firestore';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatIconModule} from '@angular/material/icon';
import {db} from '../../firebase';
import {Badge} from '../../interfaces/kollegiet';
import {getDocs} from '../../read-meter';
import {KollegietService} from '../../services/kollegiet.service';
import {TranslatePipe} from '../../translate.pipe';
import {KitchenChipComponent} from './kitchen-chip.component';

// A month of Kollegiet, as ops/stats-summary.js writes it from the nightly backup (archive/{YYYY-MM}).
interface ArchiveMonth {
  month: string;
  battles: {title: string, metric: string, winners: string[], scores: Record<string, number>, at: number}[];
  polls: {title: string, kitchenId: string, winners: string[], votes: Record<string, number>, at: number}[];
  kudos: Record<string, {highfives: number, badges: Partial<Record<Badge, number>>}>;
  notes: {kitchenId: string, text: string, replies: number, at: number}[];
}

// How far back the archive goes on screen.
const MONTHS = 12;

// Looking back: a month at a time, who won the battles and votes, who got high-fives and badges,
// and the notes everyone talked about. Read when the tab opens, a read per month, never live.
@Component({
  selector: 'app-archive',
  imports: [DatePipe, MatButtonToggleModule, MatIconModule, TranslatePipe, KitchenChipComponent],
  template: `
    @if (months.isLoading()) {
      <p class="empty">…</p>
    } @else if (months.error()) {
      <p class="empty">{{ "KOL_ARCHIVE_ERROR" | translate }}</p>
    } @else if (!list().length) {
      <p class="empty">{{ "KOL_ARCHIVE_EMPTY" | translate }}</p>
    } @else {
      <mat-button-toggle-group [value]="shown().month" (change)="pick.set($event.value)" hideSingleSelectionIndicator
                               [attr.aria-label]="'KOL_TAB_ARCHIVE' | translate">
        @for (m of list(); track m.month) {
          <mat-button-toggle [value]="m.month">{{ monthDate(m.month) | date:'MMM y' }}</mat-button-toggle>
        }
      </mat-button-toggle-group>

      @if (shown(); as m) {
        <section>
          <h3>🏆 {{ "KOL_ARCHIVE_BATTLES" | translate }}</h3>
          @for (b of m.battles; track b.at + b.title) {
            <div class="row">
              <span class="what"><b>{{ b.title }}</b> <span class="hint">{{ "KOL_METRIC_" + b.metric | translate }} · {{ b.at | date:'d/M' }}</span></span>
              <span class="who">@for (w of b.winners; track w) { <app-kitchen-chip [kitchenId]="w" /> } <span class="hint">{{ b.scores[b.winners[0]] }}</span></span>
            </div>
          } @empty {
            <p class="none">{{ "KOL_ARCHIVE_NONE" | translate }}</p>
          }
        </section>

        <section>
          <h3>🗳️ {{ "KOL_ARCHIVE_POLLS" | translate }}</h3>
          @for (p of m.polls; track p.at + p.title) {
            <div class="row">
              <span class="what"><b>{{ p.title }}</b> <span class="hint">{{ p.at | date:'d/M' }}</span></span>
              <span class="who">@for (w of p.winners; track w) { <app-kitchen-chip [kitchenId]="w" /> }
                <span class="hint">{{ p.votes[p.winners[0]] }} {{ "KOL_VOTES" | translate }}</span></span>
            </div>
          } @empty {
            <p class="none">{{ "KOL_ARCHIVE_NONE" | translate }}</p>
          }
        </section>

        <section>
          <h3>🙌 {{ "KOL_ARCHIVE_KUDOS" | translate }}</h3>
          @for (k of kudos(); track k.kitchenId) {
            <div class="row">
              <app-kitchen-chip [kitchenId]="k.kitchenId" />
              <span class="who">
                @if (k.highfives) { <span class="pin">🙌 {{ k.highfives }}</span> }
                @for (b of k.badges; track b[0]) { <span class="pin">{{ "KOL_BADGE_ICON_" + b[0] | translate }} {{ b[1] }}</span> }
              </span>
            </div>
          } @empty {
            <p class="none">{{ "KOL_ARCHIVE_NONE" | translate }}</p>
          }
        </section>

        <section>
          <h3>💬 {{ "KOL_ARCHIVE_NOTES" | translate }}</h3>
          @for (n of m.notes; track n.at) {
            <div class="note">
              <app-kitchen-chip [kitchenId]="n.kitchenId" />
              <p>{{ n.text }}</p>
              <span class="hint">{{ n.at | date:'d/M' }} · 💬 {{ n.replies }} {{ (n.replies === 1 ? "KOL_REPLY_ONE" : "KOL_REPLIES") | translate }}</span>
            </div>
          } @empty {
            <p class="none">{{ "KOL_ARCHIVE_NONE" | translate }}</p>
          }
        </section>
      }
    }
  `,
  styles: `
    :host { display: block; padding: 16px 0; }
    mat-button-toggle-group { margin-bottom: 8px; }
    section { margin-top: 16px; }
    h3 { margin: 0 0 8px; font: var(--mat-sys-title-medium); }
    .row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; padding: 8px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant); --chip-size: 24px; }
    .what { min-width: 0; overflow-wrap: anywhere; }
    .what .hint { margin-left: 6px; }
    .who { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
    .pin { padding: 2px 10px; border-radius: 999px; background: var(--mat-sys-surface-container-high); }
    .hint, .none, .empty { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .none { margin: 0; }
    .note { padding: 8px 0; border-bottom: 1px solid var(--mat-sys-outline-variant); --chip-size: 24px; }
    .note p { margin: 4px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  `,
})
export class ArchiveComponent {
  private readonly kollegiet = inject(KollegietService);
  protected readonly months = resource({
    // By the month field: Firestore does not sort by document id descending.
    loader: async () => (await getDocs(query(collection(db, 'archive'), orderBy('month', 'desc'), limit(MONTHS))))
      .docs.map(d => d.data() as ArchiveMonth),
  });
  protected readonly list = computed(() => this.months.hasValue() ? this.months.value() : []);
  protected readonly pick = signal<string | null>(null);
  // The chosen month, else the newest.
  protected readonly shown = computed(() => this.list().find(m => m.month === this.pick()) ?? this.list()[0] ?? null);
  // Kitchens by how much they got: high-fives and badges together.
  protected readonly kudos = computed(() => Object.entries(this.shown()?.kudos ?? {})
    .map(([kitchenId, k]) => ({kitchenId, highfives: k.highfives, badges: Object.entries(k.badges) as [Badge, number][]}))
    .map(k => ({...k, total: k.highfives + k.badges.reduce((n, [, c]) => n + c, 0)}))
    .sort((a, b) => b.total - a.total || this.kollegiet.card(a.kitchenId).name.localeCompare(this.kollegiet.card(b.kitchenId).name, 'da')));

  protected monthDate(month: string) {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }
}
