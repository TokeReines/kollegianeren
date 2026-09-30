import {Component, ElementRef, afterNextRender, booleanAttribute, effect, inject, input, signal, viewChild} from '@angular/core';
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

// The kitchen's side of "Message your maker": one thread per kitchen.
@Component({
  selector: 'app-maker-chat',
  imports: [DatePipe, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslatePipe],
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
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');

  constructor() {
    // Reading the thread marks the maker's replies as seen.
    effect(() => {
      this.maker.markSeenByKitchen(this.messages()).catch(() => undefined);
    });
    // Linked from the welcome as /aktuelt#chat: bring the composer into view.
    const fragment = inject(ActivatedRoute).snapshot.fragment;
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
    if (!text) {
      return;
    }
    this.text.set('');
    this.maker.send(text).catch(err => {
      this.text.set(text);
      this.notify.error(err);
    });
  }
}
