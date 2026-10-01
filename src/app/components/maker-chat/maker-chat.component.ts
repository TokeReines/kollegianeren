import {Component, ElementRef, afterNextRender, afterRenderEffect,booleanAttribute, effect, inject, input, signal, viewChild} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute} from '@angular/router';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MakerService} from '../../services/maker.service';
import {Notify} from '../../services/notify.service';
import {TranslatePipe} from '../../translate.pipe';
import {clUrl} from '../../services/cloudinary.service';
import {PictureViewerDirective} from '../aktuelt/picture-viewer';
import {ChatPicturesComponent} from './chat-pictures.component';

// The kitchen's side of "Message your maker": one thread per kitchen.
@Component({
  selector: 'app-maker-chat',
  imports: [DatePipe, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslatePipe, ChatPicturesComponent, PictureViewerDirective],
  templateUrl: './maker-chat.component.html',
  styleUrl: './maker-chat.component.scss',
})
export class MakerChatComponent {
  private readonly maker = inject(MakerService);
  private readonly notify = inject(Notify);

  // Shown inside Aktuelt rather than as its own page.
  readonly embedded = input(false, {transform: booleanAttribute});
  protected readonly photos = [
    {src: 'assets/img/maker/then.jpg', caption: 'MAKER_PHOTO_THEN'},
    {src: 'assets/img/maker/dorm-802.jpg', caption: 'MAKER_PHOTO_DORM'},
    {src: 'assets/img/maker/today.jpg', caption: 'MAKER_PHOTO_TODAY'},
  ];
  protected readonly messages = toSignal(this.maker.thread(), {initialValue: []});
  protected readonly text = signal('');
  // Pictures with the message: a screenshot helps when something goes wrong.
  protected readonly pictures = signal<string[]>([]);
  protected readonly uploading = signal(false);
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');

  constructor() {
    // Reading the thread marks the maker's replies as seen.
    effect(() => {
      this.maker.markSeenByKitchen(this.messages()).catch(() => undefined);
    });
    // Linked from the message banner as /aktuelt#message: show the newest message from Toke
    // once the thread has loaded, without opening the keyboard. The news next to it may still be
    // loading and leave the page too short to scroll, so try again until it is in view.
    const fragment = inject(ActivatedRoute).snapshot.fragment;
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let shown = fragment !== 'message';
    afterRenderEffect(() => {
      if (!shown && this.messages().length) {
        shown = true;
        const bubbles = host.querySelectorAll('.bubble.maker');
        showNewest(bubbles[bubbles.length - 1], 10);
      }
    });
    // Linked from the welcome as /aktuelt#chat: bring the composer into view.
    afterNextRender(() => {
      if (fragment === 'chat') {
        const el = this.composer()?.nativeElement;
        el?.closest('section, .page')?.scrollIntoView({behavior: 'smooth'});
        el?.focus();
      }
    });
  }

  protected send() {
    const text = this.text().trim();
    const pictures = this.pictures();
    if (!text && !pictures.length) {
      return;
    }
    this.text.set('');
    this.pictures.set([]);
    this.maker.send(text, pictures).catch(err => {
      this.text.set(text);
      this.pictures.set(pictures);
      this.notify.error(err);
    });
  }

  protected pic(id: string) {
    return clUrl(id, 'c_limit,w_480,q_auto', 'jpg');
  }
}

function showNewest(el: Element | undefined, tries: number) {
  const {top = 0, bottom = 0} = el?.getBoundingClientRect() ?? {};
  if (!el || (top >= 0 && bottom <= window.innerHeight)) {
    return;
  }
  el.scrollIntoView({block: 'center'});
  if (tries > 0) {
    setTimeout(() => showNewest(el, tries - 1), 200);
  }
}
