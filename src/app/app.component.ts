import {Component, OnInit, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {AuthService} from './services/auth.service';
import { MatSidenav } from '@angular/material/sidenav';
import {SidenavService} from './services/sidenav.service';
import {ThemeService} from './services/theme.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent implements OnInit {
  @ViewChild('sidenav') public sidenav: MatSidenav;

  constructor(public auth: AuthService, private sidenavService: SidenavService, theme: ThemeService) {
  }

  ngOnInit(): void {
    this.sidenavService.setSidenav(this.sidenav);
  }
}
