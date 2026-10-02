import {Component, computed, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {NavigationEnd, Router, RouterLink} from '@angular/router';
import {filter, map} from 'rxjs';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {NoticeService} from '../../services/notice.service';
import {TranslatePipe} from '../../translate.pipe';
import {UsageService} from '../../services/usage.service';

// What is waiting for the kitchen: a filled strip under the top bar on every page, until it is
// opened. Toke's messages and news are not shown on Aktuelt, Kollegiet's own things not on Kollegiet.
@Component({
  selector: 'app-message-banner',
  imports: [MatButtonModule, MatIconModule, RouterLink, TranslatePipe],
  template: `
    @if (shown(); as n) {
      <div class="banner" role="alert" [class.slim]="path() === '/'">
        <a class="open" (click)="usage.act('banner')" [routerLink]="n.link.path" [fragment]="n.link.fragment" [queryParams]="n.link.query">
          <span class="icon"><mat-icon>{{ notices.icon(n) }}</mat-icon></span>
          <span class="text">
            <b>{{ notices.title(n) }}</b>
            @if (n.text) {
              <span class="preview">{{ n.text }}</span>
            }
          </span>
          <span class="read">{{ "MESSAGE_READ" | translate }} <mat-icon>arrow_forward</mat-icon></span>
        </a>
        @if (notices.canDismiss(n)) {
          <button mat-icon-button class="dismiss" (click)="notices.dismiss(n)" [attr.aria-label]="'NOTICE_DISMISS' | translate">
            <mat-icon>close</mat-icon>
          </button>
        }
      </div>
    }
  `,
  styleUrl: './message-banner.component.scss',
})
export class MessageBannerComponent {
  protected readonly usage = inject(UsageService);
  private readonly router = inject(Router);
  protected readonly notices = inject(NoticeService);
  protected readonly path = toSignal(this.router.events.pipe(
    filter(e => e instanceof NavigationEnd),
    map(() => this.router.url.split(/[?#]/)[0])), {initialValue: this.router.url.split(/[?#]/)[0]});
  protected readonly shown = computed(() => this.notices.notices().find(n => !this.notices.hiddenOn(n, this.path())) ?? null);
}
