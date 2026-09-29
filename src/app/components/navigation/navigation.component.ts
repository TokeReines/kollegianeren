import {ChangeDetectionStrategy, Component, OnInit, ViewChild} from '@angular/core';
import {MatSidenav} from '@angular/material/sidenav';
import {BreakpointObserver} from '@angular/cdk/layout';
import {Observable, combineLatest, of} from 'rxjs';
import {map, shareReplay} from 'rxjs/operators';
import {SidenavService} from '../../services/sidenav.service';
import {MakerService} from '../../services/maker.service';
import {AuthService} from '../../services/auth.service';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  exact?: boolean;
  badge?: Observable<number>;
}

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class NavigationComponent implements OnInit {
  @ViewChild('sidenav', {static: true}) public sidenav: MatSidenav;

  // Phones get the menu as a slide-over; wider screens a navigation rail.
  narrow = this.breakpoints.observe('(max-width: 760px)').pipe(map(s => s.matches), shareReplay(1));
  railHidden = this.sidenavService.railHidden;
  private kitchenUnread = this.maker.unreadForKitchen().pipe(shareReplay(1));
  private makerUnread = this.maker.inbox().pipe(map(threads => threads.reduce((n, t) => n + t.unread, 0)), shareReplay(1));

  // One list for both layouts. Tablets only buy, so the management pages are hidden from them
  // (the rules enforce it regardless).
  items: Observable<NavItem[]> = combineLatest([this.auth.role, this.maker.isAdmin]).pipe(
    map(([role, admin]) => {
      const manage = role !== 'tablet';
      return [
        {path: '/', icon: 'local_grocery_store', label: 'MENU_BEERSYSTEM', exact: true, badge: of(0)},
        ...(manage ? [
          {path: '/products', icon: 'local_bar', label: 'MENU_PRODUCTS'},
          {path: '/users', icon: 'people', label: 'MENU_RESIDENTS'},
          {path: '/accounting', icon: 'receipt_long', label: 'MENU_ACCOUNTING'},
        ] : []),
        {path: '/stats', icon: 'insights', label: 'MENU_STATS'},
        {path: '/aktuelt', icon: 'campaign', label: 'MENU_AKTUELT', badge: this.kitchenUnread},
        ...(manage ? [{path: '/access', icon: 'key', label: 'MENU_ACCESS'}] : []),
        ...(admin ? [{path: '/inbox', icon: 'inbox', label: 'MENU_INBOX', badge: this.makerUnread}] : []),
      ] as NavItem[];
    }),
    shareReplay(1),
  );

  constructor(private sidenavService: SidenavService, private maker: MakerService, private auth: AuthService,
              private breakpoints: BreakpointObserver) {
  }

  ngOnInit() {
    this.sidenavService.setSidenav(this.sidenav);
  }
}
