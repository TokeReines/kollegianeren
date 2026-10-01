import {Component, DestroyRef, inject, signal} from '@angular/core';
import {takeUntilDestroyed, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {showAnchor} from '../../anchor';
import {NEWS_DAYS} from '../../interfaces/kollegiet';
import {Announcement} from '../../interfaces/message';
import {KollegietService} from '../../services/kollegiet.service';
import {millis} from '../../time';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MakerService} from '../../services/maker.service';
import {Notify} from '../../services/notify.service';
import {TranslatePipe} from '../../translate.pipe';
import {MakerChatComponent} from '../maker-chat/maker-chat.component';
import {openReveal} from '../reveal-dialog/reveal-dialog.component';

// Coffee for the maker (#87): Toke's MobilePay Box. The link opens MobilePay on the box; the
// number is shown too, for searching in the app.
const MOBILEPAY = {box: '1041TA', url: 'https://qr.mobilepay.dk/box/d534dd5a-21a4-41a7-89dd-fba68884b6a6/pay-in'};

// "Aktuelt": what's new and what's planned, written by the maker, next to the chat with him.
// Admins can post here.
@Component({
  selector: 'app-aktuelt',
  imports: [DatePipe, FormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule,
    TranslatePipe, MakerChatComponent],
  templateUrl: './aktuelt.component.html',
  styleUrl: './aktuelt.component.scss',
})
export class AktueltComponent {
  private readonly maker = inject(MakerService);
  private readonly notify = inject(Notify);
  private readonly dialog = inject(MatDialog);

  protected readonly announcements = toSignal(this.maker.announcements(), {initialValue: []});
  protected readonly isAdmin = this.maker.isAdmin;
  protected readonly mobilePay = MOBILEPAY;
  protected readonly title = signal('');
  protected readonly body = signal('');

  // When the kitchen last looked, read before this visit counts: what is newer gets a "new" tag.
  protected readonly seenBefore = signal(Number.MAX_SAFE_INTEGER);

  constructor() {
    const kollegiet = inject(KollegietService);
    const seen = () => kollegiet.markAktueltSeen().catch(() => undefined);
    firstValueFrom(kollegiet.aktueltSeen$).then(at => this.seenBefore.set(at), () => undefined).finally(seen);
    inject(DestroyRef).onDestroy(seen);
    // From a notification: #news-…, once the posts have loaded.
    inject(ActivatedRoute).fragment.pipe(takeUntilDestroyed()).subscribe(f => f?.startsWith('news-') && showAnchor(f));
  }

  protected isNew(a: Announcement): boolean {
    return millis(a.createdAt) > Math.max(this.seenBefore(), Date.now() - NEWS_DAYS * 864e5);
  }

  protected showReveal() {
    openReveal(this.dialog);
  }

  protected post() {
    this.maker.postAnnouncement(this.title().trim(), this.body().trim()).then(() => {
      this.title.set('');
      this.body.set('');
    }, this.notify.error);
  }
}
