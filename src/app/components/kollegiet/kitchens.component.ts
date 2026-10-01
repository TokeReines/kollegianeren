import {Component, computed, inject} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {ActivatedRoute, Router} from '@angular/router';
import {collection} from 'firebase/firestore';
import {map, of, switchMap} from 'rxjs';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {Achievement, Badge, MAX_LIVE_BATTLES, badgeList, highfiveId, kudosSummary} from '../../interfaces/kollegiet';
import {dayKey} from '../../interfaces/meal';
import {db, watch} from '../../firebase';
import {AuthService} from '../../services/auth.service';
import {KollegietService} from '../../services/kollegiet.service';
import {BattleFields, LeagueService} from '../../services/league.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {BadgeDialogComponent, BadgeResult, BattleDialogComponent, BattleDialogData, ProfileDialogComponent} from './dialogs';
import {KitchenChipComponent} from './kitchen-chip.component';

// Every kitchen as a card; one opened as its profile, with its badges, trophies and achievements,
// and buttons for a high-five, a badge or a challenge.
@Component({
  selector: 'app-kitchens',
  imports: [DatePipe, MatButtonModule, MatCardModule, MatIconModule, TranslatePipe, KitchenChipComponent],
  templateUrl: './kitchens.component.html',
  styleUrl: './kitchens.component.scss',
})
export class KitchensComponent {
  protected readonly kollegiet = inject(KollegietService);
  private readonly league = inject(LeagueService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(TranslateService);

  private readonly kudos = toSignal(this.kollegiet.kudos$, {initialValue: []});
  private readonly standings = toSignal(this.kollegiet.standings$, {initialValue: []});
  protected readonly me = computed(() => this.auth.membership()?.kitchenId ?? '');
  // Kitchens with a profile (and your own) as cards; the rest as a row of names, so a list of
  // kitchens nobody has set up yet does not fill the page.
  // The ones with the most on their shelf first: it is fine to brag.
  protected readonly withProfile = computed(() => {
    const score = (id: string) => {
      const s = this.summary().get(id);
      return s ? 3 * s.wins + s.highfives + Object.values(s.badges).reduce((a, n) => a + (n ?? 0), 0) : 0;
    };
    return this.kollegiet.cards().filter(k => k.profiled || k.id === this.me())
      .map(k => ({k, score: score(k.id)})).sort((a, b) => b.score - a.score).map(x => x.k);
  });
  protected readonly withoutProfile = computed(() => this.kollegiet.cards().filter(k => !k.profiled && k.id !== this.me()));
  protected readonly canManage = this.auth.canManage;

  protected readonly selectedId = toSignal(this.route.queryParamMap.pipe(map(q => q.get('kitchen'))), {initialValue: null});
  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return id ? this.kollegiet.card(id) : null;
  });

  // Badges and high-fives each kitchen got (the job's counts, plus the newest kudos).
  protected readonly summary = computed(() => kudosSummary(this.standings(), this.kudos()));

  protected readonly titles = computed(() => this.standings().find(s => s.id === this.selectedId())?.titles ?? []);
  protected readonly selectedKudos = computed(() => this.kudos().filter(k => k.to === this.selectedId() && k.kind === 'badge'));
  protected readonly achievements = toSignal(toObservable(this.selectedId).pipe(
    switchMap(id => id ? watch<Achievement>(collection(db, 'standings', id, 'achievements')) : of([]))), {initialValue: []});
  protected readonly highfivedToday = computed(() => {
    const id = this.selectedId();
    return !!id && this.kudos().some(k => k.id === highfiveId(this.me(), id, dayKey(new Date())));
  });

  protected badgeList(id: string): [Badge, number][] {
    return badgeList(this.summary().get(id));
  }

  protected open(id: string | null) {
    this.router.navigate([], {queryParams: {tab: 'kitchens', kitchen: id}, replaceUrl: !id});
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
    if (this.league.myLive().length >= MAX_LIVE_BATTLES) {
      this.notify.info(this.i18n.t('KOL_MAX_BATTLES'));
      return;
    }
    this.dialog.open<BattleDialogComponent, BattleDialogData, BattleFields>(BattleDialogComponent, {width: '480px', maxWidth: '94vw', data: {against}})
      .afterClosed().subscribe(fields => {
        if (fields) {
          this.league.create(fields).then(() => this.router.navigate([], {queryParams: {tab: 'battles'}}), this.notify.error);
        }
      });
  }

  protected editProfile() {
    const c = this.kollegiet.card(this.me());
    this.dialog.open(ProfileDialogComponent, {width: '480px', maxWidth: '94vw', data: {emoji: c.emoji, colour: c.colour, bio: c.bio}})
      .afterClosed().subscribe(p => {
        if (p) {
          this.kollegiet.saveProfile(p).catch(this.notify.error);
        }
      });
  }
}
