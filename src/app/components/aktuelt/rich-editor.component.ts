import {Component, ElementRef, afterNextRender, inject, input, model, signal, viewChild} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {CloudinaryService, clUrl} from '../../services/cloudinary.service';
import {Notify} from '../../services/notify.service';
import {TranslatePipe} from '../../translate.pipe';
import {asHtml, cleanHtml} from './rich-text';

// A text field with pictures and simple formatting (bold, bullets) for the maker: paste a screenshot or drop a picture where the
// caret is, and it is uploaded (Cloudinary) and shown right there. Pasted text comes in plain.
@Component({
  selector: 'app-rich-editor',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, TranslatePipe],
  template: `
    <div class="frame" [class.focus]="focused()">
      <div #area class="area rich-text" contenteditable="true" role="textbox" aria-multiline="true"
           [attr.aria-label]="label()" [attr.data-placeholder]="label()" [style.min-height.px]="minHeight()"
           (input)="changed()" (paste)="paste($event)" (drop)="drop($event)" (dragover)="$event.preventDefault()"
           (focus)="focused.set(true)" (blur)="focused.set(false); keepCaret()" (keyup)="keepCaret()" (mouseup)="keepCaret()"></div>
      <div class="bar">
        <!-- On the selected text (or what is typed next); mousedown keeps the selection in the text. -->
        <button mat-icon-button type="button" (mousedown)="$event.preventDefault()" (click)="format('bold')"
                [attr.aria-label]="'RICH_BOLD' | translate"><mat-icon>format_bold</mat-icon></button>
        <button mat-icon-button type="button" (mousedown)="$event.preventDefault()" (click)="format('insertUnorderedList')"
                [attr.aria-label]="'RICH_LIST' | translate"><mat-icon>format_list_bulleted</mat-icon></button>
        <button mat-button type="button" [disabled]="!cloudinary.canUpload || uploading()" (click)="file.click()">
          <mat-icon>add_photo_alternate</mat-icon> {{ "FORSLAG_ADD_PICTURE" | translate }}
        </button>
        @if (uploading()) {
          <mat-spinner diameter="20" />
          <span class="hint">{{ "FORSLAG_UPLOADING" | translate }}</span>
        } @else {
          <span class="hint">{{ "FORSLAG_PASTE_HINT" | translate }}</span>
        }
        <input #file hidden type="file" accept="image/*" multiple (change)="pick(file)">
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .frame { border: 1px solid var(--mat-sys-outline); border-radius: 4px; }
    .frame.focus { border-color: var(--mat-sys-primary); box-shadow: inset 0 0 0 1px var(--mat-sys-primary); }
    .area { padding: 12px 16px; outline: none; overflow-wrap: anywhere; font: var(--mat-sys-body-large); }
    .area:empty::before { content: attr(data-placeholder); color: var(--mat-sys-on-surface-variant); }
    .bar { display: flex; align-items: center; gap: 8px; padding: 2px 8px; border-top: 1px solid var(--mat-sys-outline-variant); }
    .hint { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
  `,
})
export class RichEditorComponent {
  protected readonly cloudinary = inject(CloudinaryService);
  private readonly notify = inject(Notify);
  // Cleaned HTML in and out.
  readonly value = model('');
  readonly label = input('');
  readonly minHeight = input(160);
  readonly uploading = model(false);
  protected readonly focused = signal(false);
  private readonly area = viewChild.required<ElementRef<HTMLElement>>('area');
  private caret: Range | null = null;

  constructor() {
    afterNextRender(() => this.area().nativeElement.innerHTML = asHtml(this.value()));
  }

  // Emptied from outside (after sending): empty here too.
  clear() {
    this.area().nativeElement.innerHTML = '';
    this.value.set('');
  }

  protected changed() {
    this.value.set(cleanHtml(this.area().nativeElement.innerHTML));
  }

  // Bold or a bullet list, as Ctrl+B does: the browser's own editing, kept by cleanHtml (b, ul, li).
  protected format(command: 'bold' | 'insertUnorderedList') {
    this.area().nativeElement.focus();
    document.execCommand(command);
    this.changed();
  }

  protected keepCaret() {
    const sel = window.getSelection();
    if (sel?.rangeCount && this.area().nativeElement.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      this.caret = sel.getRangeAt(0).cloneRange();
    }
  }

  protected paste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
    e.preventDefault();
    this.keepCaret();
    if (files.length) {
      this.insertPictures(files);
    } else {
      document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
      this.changed();
    }
  }

  protected drop(e: DragEvent) {
    const files = Array.from(e.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      const at = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (at) {
        this.caret = at;
      }
      this.insertPictures(files);
    }
  }

  protected pick(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.insertPictures(files);
  }

  // Each picture where the caret was, once it is uploaded; the caret moves on past it.
  private async insertPictures(files: File[]) {
    this.uploading.set(true);
    try {
      for (const f of files) {
        const id = await this.cloudinary.upload(f);
        const img = document.createElement('img');
        img.src = clUrl(id, 'c_limit,w_1600,q_auto', 'jpg');
        this.insertAtCaret(img);
      }
    } catch (err) {
      this.notify.error(err);
    } finally {
      this.uploading.set(false);
      this.changed();
    }
  }

  private insertAtCaret(node: Node) {
    const area = this.area().nativeElement;
    const range = this.caret && area.contains(this.caret.commonAncestorContainer) ? this.caret : null;
    if (range) {
      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      this.caret = range;
      // Typing goes on after the picture.
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      area.appendChild(node);
    }
  }
}
