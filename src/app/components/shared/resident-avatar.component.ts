import {Component, computed, input} from '@angular/core';
import {clUrl} from '../../services/cloudinary.service';

// "Anna Hansen" -> "AH", "Beboer 230" -> "B2".
export function initials(name: string): string {
  const parts = String(name || '?').trim().split(/\s+/);
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// A stable colour tone (0-2) per name, so the same resident always gets the same colour.
export function tone(name: string): number {
  let h = 0;
  for (const c of String(name || '')) {
    h = (h * 31 + c.charCodeAt(0)) >>> 0;
  }
  return h % 3;
}

// A resident's photo in a circle, or their initials on a colour picked from their name.
@Component({
  selector: 'app-resident-avatar',
  template: `
    @if (src()) {
      <img [src]="src()" alt="" loading="lazy">
    } @else {
      <span aria-hidden="true">{{ letters() }}</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      width: var(--size);
      height: var(--size);
      border-radius: 50%;
      overflow: hidden;
      font: var(--mat-sys-title-medium);
      font-weight: 700;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    :host([data-tone="1"]) {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    :host([data-tone="2"]) {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
  host: {'[style.--size.px]': 'size()', '[attr.data-tone]': 'src() ? null : colour()'},
})
export class ResidentAvatarComponent {
  readonly resident = input.required<{name: string, image?: string, clId?: string}>();
  readonly size = input(48);
  protected readonly src = computed(() => {
    const {clId, image} = this.resident();
    const px = this.size() * 2;
    return clId ? clUrl(clId, `c_fill,g_face,q_60,w_${px},h_${px},r_max`) : image || '';
  });
  protected readonly letters = computed(() => initials(this.resident().name));
  protected readonly colour = computed(() => tone(this.resident().name));
}
