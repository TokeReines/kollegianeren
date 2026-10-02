import {Component, computed, inject} from '@angular/core';
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
import {Badge, badgeList, kudosSummary} from '../../interfaces/kollegiet';
import {AuthService} from '../../services/auth.service';
import {KollegietService} from '../../services/kollegiet.service';
import {millis} from '../../time';
import {NoticeService} from '../../services/notice.service';
import {KitchenService} from '../../services/kitchen.service';
import {SidenavService} from '../../services/sidenav.service';
import {ThemeMode, ThemeService} from '../../services/theme.service';
import {Language, TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {UsageService} from '../../services/usage.service';

// M3 top app bar: navigation icon, the kitchen as the title, and one account button on the right
// that holds the kitchen, the login, theme, language and log out. A bell next to it while
// something is waiting (a message or news from Toke, an invitation, challenge or high-five on
// Kollegiet), opening a list of them. Next to the title, the badges and high-fives the kitchen has
// been given on Kollegiet, worn like pins.
@Component({
  selector: 'app-toolbar',
  imports: [MatBadgeModule, MatButtonModule, MatDividerModule, MatIconModule, MatMenuModule, MatToolbarModule, MatTooltipModule, RouterLink, TranslatePipe],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.scss',
})
export class ToolbarComponent {
  protected readonly usage = inject(UsageService);
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
  // What the kitchen has been given: its own standing (one document) and the newest kudos, which
  // the shell already listens to for the bell. New in the last day: it wiggles.
  private readonly kollegiet = inject(KollegietService);
  private readonly myStanding = toSignal(this.kollegiet.myStanding$, {initialValue: null});
  private readonly kudos = toSignal(this.kollegiet.kudos$, {initialValue: []});
  protected readonly myKitchen = computed(() => {
    const kid = this.auth.membership()?.kitchenId;
    return kid && this.kollegiet.byId().has(kid) ? kid : null;
  });
  protected readonly worn = computed(() => {
    const kitchenId = this.auth.membership()?.kitchenId;
    if (!kitchenId || !this.kollegiet.byId().has(kitchenId)) {
      return null;
    }
    const mine = this.kudos().filter(k => k.to === kitchenId);
    const standing = this.myStanding();
    const summary = kudosSummary(standing ? [{...standing, id: kitchenId}] : [], mine).get(kitchenId);
    const dayAgo = Date.now() - 864e5;
    const fresh = new Set<Badge | 'highfive'>(mine.filter(k => millis(k.createdAt) > dayAgo).map(k => k.badge ?? 'highfive'));
    const badges = badgeList(summary).map(([badge, count]) => ({badge, count, fresh: fresh.has(badge)}));
    const highfives = summary?.highfives ?? 0;
    if (!badges.length && !highfives) {
      return null;
    }
    const names = badges.map(b => `${this.i18n.t('KOL_BADGE_' + b.badge)}${b.count > 1 ? ` × ${b.count}` : ''}`);
    if (highfives) {
      names.push(`${highfives} ${this.i18n.t(highfives === 1 ? 'KOL_HIGHFIVE_ONE' : 'KOL_HIGHFIVES')}`);
    }
    return {kitchenId, badges, highfives, freshHighfive: fresh.has('highfive'), label: `${this.i18n.t('KOL_WORN')}: ${names.join(', ')}`};
  });
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
