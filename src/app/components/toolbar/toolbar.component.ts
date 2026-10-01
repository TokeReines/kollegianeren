import {Component, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {Router, RouterLink} from '@angular/router';
import {distinctUntilChanged, map, of, switchMap} from 'rxjs';
import {MatBadgeModule} from '@angular/material/badge';
import {MatButtonModule} from '@angular/material/button';
import {MatDividerModule} from '@angular/material/divider';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatToolbarModule} from '@angular/material/toolbar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {AuthService} from '../../services/auth.service';
import {NoticeService} from '../../services/notice.service';
import {KitchenService} from '../../services/kitchen.service';
import {SidenavService} from '../../services/sidenav.service';
import {ThemeMode, ThemeService} from '../../services/theme.service';
import {Language, TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';

// M3 top app bar: navigation icon, the kitchen as the title, and one account button on the right
// that holds the kitchen, the login, theme, language and log out. A bell next to it while
// something is waiting (a message or news from Toke, an invitation, challenge or high-five on
// Kollegiet), opening a list of them.
@Component({
  selector: 'app-toolbar',
  imports: [MatBadgeModule, MatButtonModule, MatDividerModule, MatIconModule, MatMenuModule, MatToolbarModule, MatTooltipModule, RouterLink, TranslatePipe],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.scss',
})
export class ToolbarComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly kitchens = inject(KitchenService);
  protected readonly sidenav = inject(SidenavService);
  protected readonly theme = inject(ThemeService);
  protected readonly i18n = inject(TranslateService);

  protected readonly notice = inject(NoticeService);
  protected readonly notices = this.notice.notices;
  protected readonly email = toSignal(this.auth.user$.pipe(map(u => u?.email || '')), {initialValue: ''});
  protected readonly kitchenName = toSignal(this.auth.membership$.pipe(
    map(m => m?.kitchenId || null),
    distinctUntilChanged(),
    switchMap(kid => kid ? this.kitchens.name(kid) : of(''))), {initialValue: ''});
  protected readonly themes: {mode: ThemeMode, icon: string, label: string}[] = [
    {mode: 'auto', icon: 'brightness_auto', label: 'THEME_OPT_AUTO'},
    {mode: 'light', icon: 'light_mode', label: 'THEME_OPT_LIGHT'},
    {mode: 'dark', icon: 'dark_mode', label: 'THEME_OPT_DARK'},
  ];
  protected readonly languages: {code: Language, label: string}[] = [{code: 'da', label: 'Dansk'}, {code: 'en', label: 'English'}];

  protected async logout() {
    await this.auth.logout();
    await this.router.navigate(['login']);
  }
}
