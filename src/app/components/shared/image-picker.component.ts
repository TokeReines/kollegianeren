import {Component, inject, input, model, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {CloudinaryService} from '../../services/cloudinary.service';
import {Notify} from '../../services/notify.service';
import {TranslatePipe} from '../../translate.pipe';
import {ProductPictureComponent} from './product-picture.component';
import {ResidentAvatarComponent} from './resident-avatar.component';

// Picture for a product or resident: upload a file (Cloudinary) or paste a URL. Sets either
// `clId` or `image`, never both.
@Component({
  selector: 'app-image-picker',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule,
    TranslatePipe, ProductPictureComponent, ResidentAvatarComponent],
  template: `
    <div class="preview">
      @if (uploading()) {
        <mat-spinner diameter="40" />
      } @else if (kind() === 'resident') {
        <app-resident-avatar [resident]="{name: name(), image: image(), clId: clId()}" [size]="72" />
      } @else {
        <app-product-picture [product]="{image: image(), clId: clId()}" [size]="72" />
      }
      <div class="actions">
        <button mat-stroked-button type="button" [disabled]="uploading() || !cloudinary.canUpload" (click)="file.click()">
          <mat-icon>upload</mat-icon> {{ "UPLOAD" | translate }}
        </button>
        @if (image() || clId()) {
          <button mat-button type="button" (click)="clear()"><mat-icon>delete</mat-icon> {{ "DELETE" | translate }}</button>
        }
      </div>
      <input #file hidden type="file" accept="image/*" (change)="upload(file)">
    </div>
    <mat-form-field class="url">
      <mat-label>{{ "PRODUCTS_URL" | translate }}</mat-label>
      <input matInput type="url" [(ngModel)]="url" (keydown.enter)="useUrl(); $event.preventDefault()">
      <button mat-icon-button matSuffix type="button" [disabled]="!url().trim()" (click)="useUrl()" [attr.aria-label]="'OK' | translate">
        <mat-icon>check</mat-icon>
      </button>
    </mat-form-field>
  `,
  styles: `
    :host { display: block; }
    .preview { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .url { width: 100%; }
  `,
})
export class ImagePickerComponent {
  protected readonly cloudinary = inject(CloudinaryService);
  private readonly notify = inject(Notify);
  readonly image = model('');
  readonly clId = model('');
  // Residents are shown as a round photo (or initials of `name`), products on a tile.
  readonly kind = input<'product' | 'resident'>('product');
  readonly name = input('');
  protected readonly url = signal('');
  protected readonly uploading = signal(false);

  protected useUrl() {
    const url = this.url().trim();
    if (url) {
      this.image.set(url);
      this.clId.set('');
      this.url.set('');
    }
  }

  protected clear() {
    this.image.set('');
    this.clId.set('');
  }

  protected async upload(input: HTMLInputElement) {
    const file = input.files?.item(0);
    input.value = '';
    if (!file) {
      return;
    }
    this.uploading.set(true);
    try {
      this.clId.set(await this.cloudinary.upload(file));
      this.image.set('');
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.uploading.set(false);
    }
  }
}
