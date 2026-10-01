import {Component, computed, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {NavigationEnd, Router, RouterLink} from '@angular/router';
import {filter, map} from 'rxjs';
import {MatIconModule} from '@angular/material/icon';
import {MakerService} from '../../services/maker.service';
import {TranslatePipe} from '../../translate.pipe';

// A new message from Toke: a filled strip under the top bar on every page, until someone opens
// it. Not on Aktuelt, where the thread itself is.
@Component({
  selector: 'app-message-banner',
  imports: [MatIconModule, RouterLink, TranslatePipe],
  template: `
    @if (shown() && unread()[0]; as latest) {
      <a class="banner" routerLink="/aktuelt" fragment="message" role="alert">
        <span class="icon"><mat-icon>mark_email_unread</mat-icon></span>
        <span class="text">
          @if (unread().length > 1) {
            <b>{{ unread().length }} {{ "MESSAGES_FROM_TOKE" | translate }}</b>
          } @else {
            <b>{{ "MESSAGE_FROM_TOKE" | translate }}</b>
          }
          <span class="preview">{{ latest.text }}</span>
        </span>
        <span class="read">{{ "MESSAGE_READ" | translate }} <mat-icon>arrow_forward</mat-icon></span>
      </a>
    }
  `,
  styleUrl: './message-banner.component.scss',
})
export class MessageBannerComponent {
  private readonly router = inject(Router);
  protected readonly unread = toSignal(inject(MakerService).unreadByKitchen$, {initialValue: []});
  private readonly path = toSignal(this.router.events.pipe(
    filter(e => e instanceof NavigationEnd),
    map(() => this.router.url.split(/[?#]/)[0])), {initialValue: this.router.url.split(/[?#]/)[0]});
  protected readonly shown = computed(() => this.path() !== '/aktuelt');
}
