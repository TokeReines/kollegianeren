import {Component, OnInit, ViewChild} from '@angular/core';
import {AuthService} from './services/auth.service';
import { MatSidenav } from '@angular/material/sidenav';
import {SidenavService} from './services/sidenav.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  @ViewChild('sidenav', { static: false }) public sidenav: MatSidenav;

  constructor(public auth: AuthService, private sidenavService: SidenavService) {
  }

  ngOnInit(): void {
    this.sidenavService.setSidenav(this.sidenav);
  }
}
