import {Component, computed, input} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {clUrl} from '../../services/cloudinary.service';

// A product's picture on a white tile (product photos mostly have white backgrounds, so they look
// placed rather than cut out in dark mode), or a drink icon when there is none.
@Component({
  selector: 'app-product-picture',
  imports: [MatIconModule],
  template: `
    @if (src()) {
      <img [src]="src()" alt="" loading="lazy">
    } @else {
      <mat-icon aria-hidden="true">local_drink</mat-icon>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      width: var(--size);
      height: var(--size);
      padding: 4px;
      border-radius: 8px;
      background: #fff;
    }
    :host(.empty) {
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
    }
    img {
      max-width: 100%;
      max-height: 100%;
    }
    mat-icon {
      font-size: calc(var(--size) * .5);
      width: auto;
      height: auto;
    }
  `,
  host: {'[style.--size.px]': 'size()', '[class.empty]': '!src()'},
})
export class ProductPictureComponent {
  readonly product = input.required<{image?: string, clId?: string}>();
  readonly size = input(56);
  protected readonly src = computed(() => {
    const {clId, image} = this.product();
    const px = this.size() * 2;
    return clId ? clUrl(clId, `c_fit,q_60,w_${px},h_${px}`) : image || '';
  });
}
