import {Component, OnInit, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';
import {map, shareReplay} from 'rxjs/operators';
import {BreakpointObserver} from '@angular/cdk/layout';
import {SidenavService} from '../../services/sidenav.service';
import {MakerService} from '../../services/maker.service';
import {AuthService} from '../../services/auth.service';

@Component({
    selector: 'app-navigation',
    templateUrl: './navigation.component.html',
    styleUrls: ['./navigation.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class NavigationComponent implements OnInit {
  @ViewChild('sidenav', { static: true }) public sidenav: MatSidenav;

  // Phones get the menu as a slide-over instead of a column that squeezes the page.
  narrow = this.breakpoints.observe('(max-width: 760px)').pipe(map(s => s.matches), shareReplay(1));
  isAdmin = this.maker.isAdmin;
  canManage = this.auth.role.pipe(map(role => role !== 'tablet'));
  kitchenUnread = this.maker.unreadForKitchen();
  makerUnread = this.maker.inbox().pipe(map(threads => threads.reduce((n, t) => n + t.unread, 0)));

  constructor(private sidenavService: SidenavService, private maker: MakerService, private auth: AuthService,
              private breakpoints: BreakpointObserver) {
  }

  ngOnInit() {
    this.sidenavService.setSidenav(this.sidenav);
  }


  closeIfNarrow() {
    if (this.breakpoints.isMatched('(max-width: 760px)')) {
      this.sidenav.close();
    }
  }
}
