import {Component, input, output} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {User} from '../../interfaces/user';
import {ResidentAvatarComponent} from '../shared/resident-avatar.component';

// Residents as tiles to tap, like on the buy page: who cooks, who eats.
@Component({
  selector: 'app-resident-tiles',
  imports: [MatIconModule, ResidentAvatarComponent],
  template: `
    @for (u of residents(); track u.id) {
      @let on = selected().includes(u.id);
      <button type="button" class="tile" [class.selected]="on" [attr.aria-pressed]="on" (click)="picked.emit(u)">
        <app-resident-avatar [resident]="u" [size]="40" />
        <span class="text"><span class="name">{{ u.name }}</span><span class="room">{{ u.room }}</span></span>
        @if (on) {
          <mat-icon class="check">check_circle</mat-icon>
        }
      </button>
    }
  `,
  styles: `
    :host { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
    .tile {
      display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 6px 10px; text-align: left;
      border: 1px solid var(--mat-sys-outline-variant); border-radius: 12px; cursor: pointer;
      background: var(--mat-sys-surface); color: var(--mat-sys-on-surface); font: inherit;
    }
    .tile.selected { background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); border-color: transparent; }
    .text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .name { font: var(--mat-sys-title-small); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .room { font: var(--mat-sys-body-small); opacity: 0.8; }
    .check { color: var(--mat-sys-primary); }
  `,
})
export class ResidentTilesComponent {
  readonly residents = input.required<User[]>();
  readonly selected = input<string[]>([]);
  readonly picked = output<User>();
}
