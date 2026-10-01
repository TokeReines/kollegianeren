import {Component, computed, inject, input} from '@angular/core';
import {KollegietService} from '../../services/kollegiet.service';

// A kitchen as other kitchens see it: its emoji on its colour, and its name.
@Component({
  selector: 'app-kitchen-chip',
  template: `
    <span class="emoji" [attr.data-colour]="card().colour" aria-hidden="true">{{ card().emoji }}</span>
    @if (!iconOnly()) {
      <span class="name">{{ card().name }}</span>
    }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 6px; min-width: 0; vertical-align: middle; }
    .emoji {
      flex: none; display: grid; place-items: center; width: var(--chip-size, 28px); height: var(--chip-size, 28px);
      border-radius: 50%; font-size: calc(var(--chip-size, 28px) * 0.55); line-height: 1;
      background: var(--kitchen-colour, var(--mat-sys-surface-container-highest));
    }
    .name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    /* A kitchen's own colour is its identity, like a product photo: fixed hues, mixed into the
       surface so they sit right in light and dark. */
    [data-colour=purple] { --kitchen-colour: color-mix(in srgb, #7e57c2 40%, var(--mat-sys-surface)); }
    [data-colour=blue] { --kitchen-colour: color-mix(in srgb, #1e88e5 40%, var(--mat-sys-surface)); }
    [data-colour=teal] { --kitchen-colour: color-mix(in srgb, #00897b 40%, var(--mat-sys-surface)); }
    [data-colour=green] { --kitchen-colour: color-mix(in srgb, #43a047 40%, var(--mat-sys-surface)); }
    [data-colour=lime] { --kitchen-colour: color-mix(in srgb, #c0ca33 45%, var(--mat-sys-surface)); }
    [data-colour=amber] { --kitchen-colour: color-mix(in srgb, #ffb300 45%, var(--mat-sys-surface)); }
    [data-colour=orange] { --kitchen-colour: color-mix(in srgb, #fb8c00 40%, var(--mat-sys-surface)); }
    [data-colour=red] { --kitchen-colour: color-mix(in srgb, #e53935 40%, var(--mat-sys-surface)); }
    [data-colour=pink] { --kitchen-colour: color-mix(in srgb, #d81b60 40%, var(--mat-sys-surface)); }
  `,
})
export class KitchenChipComponent {
  private readonly kollegiet = inject(KollegietService);
  readonly kitchenId = input.required<string>();
  readonly iconOnly = input(false);
  protected readonly card = computed(() => this.kollegiet.card(this.kitchenId()));
}
