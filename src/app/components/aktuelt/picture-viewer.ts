import {Component, Directive, HostListener, inject} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialog, MatDialogModule} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {TranslatePipe} from '../../translate.pipe';

// A Cloudinary picture as large as the screen allows (no smaller copy).
function large(src: string): string {
  return src.replace(/\/upload\/[^/]*\//, '/upload/c_limit,w_2400,q_auto/');
}

// A picture on the whole screen: pinch to zoom on a tablet, tap anywhere to close.
@Component({
  selector: 'app-picture-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe],
  template: `
    <button type="button" class="view" mat-dialog-close [attr.aria-label]="'CLOSE' | translate">
      <img [src]="src" alt="">
    </button>
    <button mat-icon-button class="close" mat-dialog-close [attr.aria-label]="'CLOSE' | translate"><mat-icon>close</mat-icon></button>
  `,
  styles: `
    :host { display: block; position: relative; }
    .view { display: grid; place-items: center; width: 100vw; height: 100dvh; padding: 0; border: none; background: none; cursor: zoom-out; }
    img { max-width: 100vw; max-height: 100dvh; object-fit: contain; touch-action: pinch-zoom; }
    .close { position: absolute; top: 12px; right: 12px; background: rgb(0 0 0 / 0.5); color: white; }
  `,
})
export class PictureDialogComponent {
  protected readonly src = large(inject<string>(MAT_DIALOG_DATA));
}

// On rich text: a tapped picture opens large.
@Directive({selector: '[appPictureViewer]'})
export class PictureViewerDirective {
  private readonly dialog = inject(MatDialog);

  @HostListener('click', ['$event'])
  protected open(e: MouseEvent) {
    const t = e.target;
    if (t instanceof HTMLImageElement) {
      this.dialog.open(PictureDialogComponent, {data: t.src, maxWidth: '100vw', maxHeight: '100dvh', width: '100vw', height: '100dvh',
        panelClass: 'picture-panel', autoFocus: false});
    }
  }
}
