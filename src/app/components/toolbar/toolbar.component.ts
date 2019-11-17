import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { SidenavService } from '../../services/sidenav.service';
import { TranslateService } from '../../services/translate.service';

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss']
})
export class ToolbarComponent implements OnInit {
  currentLanguage: string = this.translate.getLanguage();

  constructor(
    private auth: AuthService,
    private sidenav: SidenavService,
    private router: Router,
    private translate: TranslateService) {
  }

  ngOnInit() { }

  setLang() {
    if (this.currentLanguage === 'en') {
      this.currentLanguage = 'da';
    } else {
      this.currentLanguage = 'en';
    }
    this.translate.use(this.currentLanguage);
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
