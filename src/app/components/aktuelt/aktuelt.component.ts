import {Component, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {environment} from '../../../environments/environment';
import {MakerService} from '../../services/maker.service';
import {Notify} from '../../services/notify.service';
import {TranslatePipe} from '../../translate.pipe';
import {MakerChatComponent} from '../maker-chat/maker-chat.component';
import {openReveal} from '../reveal-dialog/reveal-dialog.component';

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
  protected readonly coffeeUrl = environment.maker.coffeeUrl;
  protected readonly title = signal('');
  protected readonly body = signal('');

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
