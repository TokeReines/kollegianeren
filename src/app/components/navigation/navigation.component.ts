import {Component, OnInit, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';
import {map} from 'rxjs/operators';
import {SidenavService} from '../../services/sidenav.service';
import {MakerService} from '../../services/maker.service';

@Component({
    selector: 'app-navigation',
    templateUrl: './navigation.component.html',
    styleUrls: ['./navigation.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class NavigationComponent implements OnInit {
  @ViewChild('sidenav', { static: true }) public sidenav: MatSidenav;

  isAdmin = this.maker.isAdmin;
  kitchenUnread = this.maker.unreadForKitchen();
  makerUnread = this.maker.inbox().pipe(map(threads => threads.reduce((n, t) => n + t.unread, 0)));

  constructor(private sidenavService: SidenavService, private maker: MakerService) {
  }

  ngOnInit() {
    this.sidenavService.setSidenav(this.sidenav);
  }

}
