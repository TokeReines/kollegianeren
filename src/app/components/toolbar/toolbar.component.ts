import {Component, OnInit} from '@angular/core';
import {AuthService} from '../../services/auth.service';
import {Router} from '@angular/router';
import {SidenavService} from '../../services/sidenav.service';

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss']
})
export class ToolbarComponent implements OnInit {
  constructor(private auth: AuthService, private sidenav: SidenavService, private router: Router) {
  }

  ngOnInit() {
  }

  logout() {
    this.auth.logout()
      .then((success) => {
        this.router.navigate(['login']);
      });
  }

  toggleSidenav() {
    this.sidenav.toggle();
  }
}
