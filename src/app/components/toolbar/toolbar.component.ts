import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { SidenavService } from '../../services/sidenav.service';
import { TranslateService } from '../../services/translate.service';
import { ThemeMode, ThemeService } from '../../services/theme.service';
import { KitchenService } from '../../services/kitchen.service';
import { of } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';

@Component({
    selector: 'app-toolbar',
    templateUrl: './toolbar.component.html',
    styleUrls: ['./toolbar.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ToolbarComponent implements OnInit {
  currentLanguage: string = this.translate.getLanguage();
  email = this.auth.user.pipe(map(u => u?.email || ''));
  themes: {mode: ThemeMode, icon: string, label: string}[] = [
    {mode: 'auto', icon: 'brightness_auto', label: 'THEME_OPT_AUTO'},
    {mode: 'light', icon: 'light_mode', label: 'THEME_OPT_LIGHT'},
    {mode: 'dark', icon: 'dark_mode', label: 'THEME_OPT_DARK'},
  ];
  languages = [{code: 'da', label: 'Dansk'}, {code: 'en', label: 'English'}];
  kitchenName = this.auth.membership.pipe(
    map(m => m?.kitchenId || null),
    distinctUntilChanged(),
    switchMap(kid => kid ? this.kitchens.name(kid) : of('')));

  constructor(
    private auth: AuthService,
    private router: Router,
    private translate: TranslateService,
    private kitchens: KitchenService,
    public sidenav: SidenavService,
    public theme: ThemeService) {
  }

  ngOnInit() { }

  setLang(code: string) {
    this.currentLanguage = code;
    this.translate.use(code);
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
