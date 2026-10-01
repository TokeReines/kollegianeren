import {Component, computed, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {NavigationEnd, Router, RouterLink} from '@angular/router';
import {filter, map} from 'rxjs';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {KollegietService} from '../../services/kollegiet.service';
import {NoticeService} from '../../services/notice.service';
import {TranslatePipe} from '../../translate.pipe';

const ICONS = {maker: 'mark_email_unread', invite: 'celebration', challenge: 'sports_kabaddi', kudos: 'front_hand', event: 'event'};

// What is waiting for the kitchen: a filled strip under the top bar on every page, until it is
// opened. A message from Toke is not shown on Aktuelt, Kollegiet's own things not on Kollegiet.
@Component({
  selector: 'app-message-banner',
  imports: [MatButtonModule, MatIconModule, RouterLink, TranslatePipe],
  template: `
    @if (shown(); as n) {
      <div class="banner" role="alert">
        <a class="open" [routerLink]="n.link.path" [fragment]="n.link.fragment" [queryParams]="n.link.query">
          <span class="icon"><mat-icon>{{ icons[n.kind] }}</mat-icon></span>
          <span class="text">
            @if (n.kind === 'maker') {
              @if (makerUnread() > 1) {
                <b>{{ makerUnread() }} {{ "MESSAGES_FROM_TOKE" | translate }}</b>
              } @else {
                <b>{{ "MESSAGE_FROM_TOKE" | translate }}</b>
              }
            } @else {
              <b>{{ kollegiet.card(n.from ?? '').emoji }} {{ kollegiet.card(n.from ?? '').name }} {{ "NOTICE_" + n.kind | translate }}</b>
            }
            @if (n.text) {
              <span class="preview">{{ n.text }}</span>
            }
          </span>
          <span class="read">{{ "MESSAGE_READ" | translate }} <mat-icon>arrow_forward</mat-icon></span>
        </a>
        @if (n.kind !== 'maker') {
          <button mat-icon-button class="dismiss" (click)="notices.dismiss()" [attr.aria-label]="'NOTICE_DISMISS' | translate">
            <mat-icon>close</mat-icon>
          </button>
        }
      </div>
    }
  `,
  styleUrl: './message-banner.component.scss',
})
export class MessageBannerComponent {
  private readonly router = inject(Router);
  protected readonly notices = inject(NoticeService);
  protected readonly kollegiet = inject(KollegietService);
  protected readonly icons = ICONS;
  protected readonly makerUnread = this.notices.makerUnread;
  private readonly path = toSignal(this.router.events.pipe(
    filter(e => e instanceof NavigationEnd),
    map(() => this.router.url.split(/[?#]/)[0])), {initialValue: this.router.url.split(/[?#]/)[0]});
  protected readonly shown = computed(() => this.notices.notices().find(n =>
    n.kind === 'maker' ? this.path() !== '/aktuelt' : !this.path().startsWith('/kollegiet')) ?? null);
}
