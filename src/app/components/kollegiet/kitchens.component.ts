import {Component, computed, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {ActivatedRoute, Router} from '@angular/router';
import {firstValueFrom, map} from 'rxjs';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {Achievement, Badge, KitchenColour, NOTES_PER_KITCHEN, TOO_MANY_BATTLES, badgeList, highfiveId, kudosSummary} from '../../interfaces/kollegiet';
import {dayKey} from '../../interfaces/meal';
import {AccessService} from '../../services/access.service';
import {AuthService} from '../../services/auth.service';
import {KollegietService} from '../../services/kollegiet.service';
import {BattleFields, LeagueService} from '../../services/league.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {
  BadgeDialogComponent, BadgeResult, BattleDialogComponent, BattleDialogData, BorrowData, BorrowDialogComponent, ProfileDialogComponent, ProfileFields,
} from './dialogs';
import {KitchenChipComponent} from './kitchen-chip.component';
import {ShelfGuideComponent} from './shelf-guide.component';
import {UsageService} from '../../services/usage.service';

// Every kitchen as a card; one opened as its profile, with its badges, trophies and achievements,
// and buttons for a high-five, a badge or a challenge.
@Component({
  selector: 'app-kitchens',
  imports: [DatePipe, MatButtonModule, MatCardModule, MatIconModule, TranslatePipe, KitchenChipComponent],
  templateUrl: './kitchens.component.html',
  styleUrl: './kitchens.component.scss',
})
export class KitchensComponent {
  private readonly usage = inject(UsageService);
  protected readonly kollegiet = inject(KollegietService);
  private readonly league = inject(LeagueService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(TranslateService);
  private readonly access = inject(AccessService);

  private readonly kudos = toSignal(this.kollegiet.kudos$, {initialValue: []});
  private readonly standings = toSignal(this.kollegiet.standings$, {initialValue: []});
  // The signed-in kitchen; empty for the maker, who has none.
  protected readonly me = computed(() => this.auth.hasKitchen() ? this.auth.membership()?.kitchenId ?? '' : '');
  // Every kitchen as a card, the ones with the most on their shelf first (it is fine to brag), then
  // the ones with a profile, then by name.
  protected readonly cards = computed(() => {
    const score = (id: string) => {
      const s = this.summary().get(id);
      const won = s ? 3 * s.wins + s.highfives + Object.values(s.badges).reduce((a, n) => a + (n ?? 0), 0) : 0;
      return won + 3 * this.titlesOf(id).length + this.achievementsOf(id).length;
    };
    return this.kollegiet.cards().map(k => ({k, score: score(k.id)}))
      .sort((a, b) => b.score - a.score || Number(b.k.profiled) - Number(a.k.profiled)).map(x => x.k);
  });
  protected readonly canManage = this.auth.canManage;

  // Opens on your own kitchen; closing the profile leaves `kitchen=` empty, which shows none.
  private readonly kitchenParam = toSignal(this.route.queryParamMap.pipe(map(q => q.get('kitchen'))), {initialValue: null});
  protected readonly selectedId = computed(() => this.kitchenParam() ?? (this.me() || null));
  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return id ? this.kollegiet.card(id) : null;
  });

  // Badges and high-fives each kitchen got (the job's counts, plus the newest kudos).
  protected readonly summary = computed(() => kudosSummary(this.standings(), this.kudos()));

  protected readonly titles = computed(() => this.standings().find(s => s.id === this.selectedId())?.titles ?? []);
  protected readonly selectedKudos = computed(() => this.kudos().filter(k => k.to === this.selectedId() && k.kind === 'badge'));
  // Every kitchen's achievements, for the cards and the profile alike.
  private readonly achievementsBy = toSignal(this.kollegiet.achievements$, {initialValue: new Map<string, Achievement[]>()});
  protected readonly achievements = computed(() => this.achievementsOf(this.selectedId() ?? ''));

  protected achievementsOf(id: string): Achievement[] {
    return this.achievementsBy().get(id) ?? [];
  }

  protected titlesOf(id: string): string[] {
    return this.standings().find(s => s.id === id)?.titles ?? [];
  }
  protected readonly highfivedToday = computed(() => {
    const id = this.selectedId();
    return !!id && this.kudos().some(k => k.id === highfiveId(this.me(), id, dayKey(new Date())));
  });

  protected badgeList(id: string): [Badge, number][] {
    return badgeList(this.summary().get(id));
  }

  protected open(id: string | null) {
    this.router.navigate([], {queryParams: {tab: 'kitchens', kitchen: id ?? ''}, replaceUrl: !id});
  }

  protected highfive(to: string) {
    this.kollegiet.highfive(to).then(
      () => this.notify.info(`🙌 ${this.i18n.t('KOL_HIGHFIVE_SENT')} ${this.kollegiet.card(to).name}`),
      () => this.notify.info(this.i18n.t('KOL_HIGHFIVE_DONE')));
  }

  protected badge(to: string) {
    this.dialog.open<BadgeDialogComponent, string, BadgeResult>(BadgeDialogComponent, {width: '480px', maxWidth: '94vw', data: to})
      .afterClosed().subscribe(r => {
        if (r) {
          this.giveBadge(to, r.badge!, r.reason);
        }
      });
  }

  private giveBadge(to: string, badge: Badge, reason: string) {
    this.kollegiet.giveBadge(to, badge, reason).then(
      () => this.notify.info(`${this.i18n.t('KOL_BADGE_ICON_' + badge)} ${this.i18n.t('KOL_BADGE_SENT')} ${this.kollegiet.card(to).name}`),
      this.notify.error);
  }

  protected challenge(against: string) {
    this.dialog.open<BattleDialogComponent, BattleDialogData, BattleFields>(BattleDialogComponent, {width: '480px', maxWidth: '94vw', data: {against}})
      .afterClosed().subscribe(fields => {
        if (fields) {
          this.league.create(fields).then(() => this.router.navigate([], {queryParams: {tab: 'battles'}}),
            err => String(err).includes(TOO_MANY_BATTLES) ? this.notify.info(this.i18n.t('KOL_MAX_BATTLES')) : this.notify.error(err));
        }
      });
  }

  // What can be on the shelf and how to get it; what this kitchen has ticked off.
  protected guide() {
    this.usage.act('shelf-guide');
    this.dialog.open(ShelfGuideComponent, {width: '600px', maxWidth: '94vw', data: this.achievementsOf(this.me()).map(a => a.id)});
  }

  // What the other kitchens lend, every thing with its kitchen.
  protected readonly lendable = computed(() => this.kollegiet.cards().filter(k => k.id !== this.me())
    .flatMap(k => k.lends.map(item => ({kitchenId: k.id, item}))));

  // Asking to borrow is a note on the board for that kitchen; its answer comes there too. A kitchen
  // with all its notes up takes one down on the board first.
  protected async ask(kitchenId: string, item: string) {
    const posts = await firstValueFrom(this.kollegiet.posts$);
    if (posts.filter(p => !p.parentId && p.kitchenId === this.me()).length >= NOTES_PER_KITCHEN) {
      this.notify.action(this.i18n.t('KOL_BORROW_FULL'), this.i18n.t('KOL_TO_BOARD'), 8000)
        .subscribe(() => this.router.navigate([], {queryParams: {tab: 'board'}}));
      return;
    }
    const kitchen = this.kollegiet.card(kitchenId).name;
    this.dialog.open<BorrowDialogComponent, BorrowData, string>(BorrowDialogComponent, {width: '480px', maxWidth: '94vw',
      data: {kitchen, text: this.i18n.t('KOL_BORROW_TEXT').replace('{item}', item)}})
      .afterClosed().subscribe(text => {
        if (text) {
          this.usage.act('lend-ask');
          this.kollegiet.post(text, {to: kitchenId}).then(
            () => this.notify.info(`🤝 ${this.i18n.t('KOL_BORROW_SENT')} ${kitchen}`),
            err => this.notify.info(String(err).includes('permission') ? this.i18n.t('KOL_TOO_SOON') : String(err)));
        }
      });
  }

  protected editProfile() {
    const c = this.kollegiet.card(this.me());
    this.dialog.open<ProfileDialogComponent, ProfileFields, ProfileFields>(ProfileDialogComponent,
      {width: '480px', maxWidth: '94vw', data: {name: c.name, emoji: c.emoji, colour: c.colour as KitchenColour, bio: c.bio, lends: c.lends}})
      .afterClosed().subscribe(p => {
        if (p) {
          const {name, ...profile} = p;
          Promise.all([this.kollegiet.saveProfile(profile), name !== c.name ? this.access.rename(name) : null])
            .then(() => this.notify.info(this.i18n.t('KOL_PROFILE_SAVED')), this.notify.error);
        }
      });
  }
}
