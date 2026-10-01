import {Component, inject, model} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {CloudinaryService, clUrl} from '../../services/cloudinary.service';
import {Notify} from '../../services/notify.service';
import {TranslatePipe} from '../../translate.pipe';

export const CHAT_PICTURES_MAX = 4;

// Pictures for a message to or from Toke (a screenshot of what goes wrong): pasted into the text
// field (paste() from it) or picked, uploaded to Cloudinary, kept as public ids.
@Component({
  selector: 'app-chat-pictures',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, TranslatePipe],
  template: `
    <div class="pictures">
      @for (p of pictures(); track p) {
        <span class="thumb">
          <img [src]="thumb(p)" alt="">
          <button type="button" mat-icon-button class="drop" (click)="drop(p)" [attr.aria-label]="'DELETE' | translate"><mat-icon>close</mat-icon></button>
        </span>
      }
      @if (uploading()) {
        <mat-spinner diameter="24" />
      }
      <button type="button" mat-button [disabled]="!cloudinary.canUpload || uploading() || pictures().length >= max" (click)="file.click()">
        <mat-icon>add_photo_alternate</mat-icon> {{ "FORSLAG_ADD_PICTURE" | translate }}
      </button>
      <input #file hidden type="file" accept="image/*" multiple (change)="pick(file)">
    </div>
  `,
  styles: `
    .pictures { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .thumb { position: relative; }
    .thumb img { width: 72px; height: 54px; object-fit: cover; border-radius: 8px; display: block; }
    .drop { position: absolute; top: -10px; right: -10px; transform: scale(0.7); background: var(--mat-sys-surface); }
  `,
})
export class ChatPicturesComponent {
  protected readonly cloudinary = inject(CloudinaryService);
  private readonly notify = inject(Notify);
  readonly pictures = model<string[]>([]);
  readonly uploading = model(false);
  protected readonly max = CHAT_PICTURES_MAX;

  protected thumb(id: string) {
    return clUrl(id, 'c_fill,w_160,h_120,q_auto', 'jpg');
  }

  // From the text field: a pasted picture is uploaded; pasted text goes in as usual.
  paste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      this.add(files);
    }
  }

  protected pick(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.add(files);
  }

  protected drop(id: string) {
    this.pictures.update(list => list.filter(p => p !== id));
  }

  private async add(files: File[]) {
    this.uploading.set(true);
    try {
      for (const f of files.slice(0, Math.max(0, CHAT_PICTURES_MAX - this.pictures().length))) {
        const id = await this.cloudinary.upload(f);
        this.pictures.update(list => [...list, id]);
      }
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.uploading.set(false);
    }
  }
}
