import {Component, computed, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {map} from 'rxjs';
import {MatBadgeModule} from '@angular/material/badge';
import {MatIconModule} from '@angular/material/icon';
import {MatListModule} from '@angular/material/list';
import {MatSidenavModule} from '@angular/material/sidenav';
import {AuthService} from '../../services/auth.service';
import {MakerService} from '../../services/maker.service';
import {SidenavService} from '../../services/sidenav.service';
import {TranslatePipe} from '../../translate.pipe';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  exact?: boolean;
  badge?: number;
}

// Phones get the menu as a slide-over; wider screens a Material 3 navigation rail.
@Component({
  selector: 'app-navigation',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MatBadgeModule, MatIconModule, MatListModule, MatSidenavModule, TranslatePipe],
  templateUrl: './navigation.component.html',
  styleUrl: './navigation.component.scss',
})
export class NavigationComponent {
  private readonly auth = inject(AuthService);
  private readonly maker = inject(MakerService);
  protected readonly sidenav = inject(SidenavService);

  private readonly kitchenUnread = toSignal(this.maker.unreadForKitchen(), {initialValue: 0});
  private readonly makerUnread = toSignal(this.maker.inbox().pipe(map(threads => threads.reduce((n, t) => n + t.unread, 0))), {initialValue: 0});

  // One list for both layouts. Tablets only buy, so the management pages are hidden from them
  // (the guards and rules enforce it regardless).
  protected readonly items = computed<NavItem[]>(() => {
    const manage = this.auth.canManage();
    return [
      {path: '/', icon: 'local_grocery_store', label: 'MENU_BEERSYSTEM', exact: true},
      ...(manage ? [
        {path: '/products', icon: 'local_bar', label: 'MENU_PRODUCTS'},
        {path: '/users', icon: 'people', label: 'MENU_RESIDENTS'},
        {path: '/accounting', icon: 'receipt_long', label: 'MENU_ACCOUNTING'},
      ] : []),
      {path: '/stats', icon: 'insights', label: 'MENU_STATS'},
      {path: '/aktuelt', icon: 'campaign', label: 'MENU_AKTUELT', badge: this.kitchenUnread()},
      ...(manage ? [{path: '/access', icon: 'key', label: 'MENU_ACCESS'}] : []),
      ...(this.maker.isAdmin() ? [{path: '/inbox', icon: 'inbox', label: 'MENU_INBOX', badge: this.makerUnread()}] : []),
    ];
  });

  protected openedChange(open: boolean) {
    if (this.sidenav.narrow()) {
      this.sidenav.phoneMenuOpen.set(open);
    }
  }
}
