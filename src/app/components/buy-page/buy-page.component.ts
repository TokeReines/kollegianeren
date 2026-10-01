import {Component, DestroyRef, computed, effect, inject, signal, untracked} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DecimalPipe} from '@angular/common';
import {map} from 'rxjs';
import {MatBadgeModule} from '@angular/material/badge';
import {MatBottomSheet} from '@angular/material/bottom-sheet';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {Product} from '../../interfaces/product';
import {User, byRoom} from '../../interfaces/user';
import {ProductService} from '../../services/product.service';
import {PurchaseService} from '../../services/purchase.service';
import {UserService} from '../../services/user.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {ProductPictureComponent} from '../shared/product-picture.component';
import {ResidentAvatarComponent} from '../shared/resident-avatar.component';
import {HistoryBottomSheetComponent} from './history-bottom-sheet/history-bottom-sheet.component';
import {describeSale, productOrder} from './basket';
import {LeagueService} from '../../services/league.service';
import {BattleTickerComponent} from '../kollegiet/battle-ticker.component';

// How long the confirmation of a purchase stays in the bar.
const CONFIRM_MS = 4000;

// The tablet's screen: tap a product (again for more), tap one or more residents, buy. Every
// chosen resident gets that many. Tapping another product switches to it; right-click or
// long-press takes one off. A wrong purchase is taken back under "Seneste køb".
@Component({
  selector: 'app-buy-page',
  imports: [DecimalPipe, MatBadgeModule, MatButtonModule, MatIconModule, TranslatePipe, ProductPictureComponent, ResidentAvatarComponent,
    BattleTickerComponent],
  templateUrl: './buy-page.component.html',
  styleUrl: './buy-page.component.scss',
})
export class BuyPageComponent {
  private readonly purchaseService = inject(PurchaseService);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(TranslateService);
  private readonly bottomSheet = inject(MatBottomSheet);

  private readonly allProducts = toSignal(inject(ProductService).list().pipe(map(list => list.filter(p => p.active))), {initialValue: []});
  // Most bought first. The order is fixed when the page opens (and when products are added or
  // removed), so tiles do not jump around while people are tapping.
  private readonly productIds = computed(() => this.allProducts().map(p => p.id).sort().join());
  private readonly order = computed(() => {
    this.productIds();
    return untracked(() => productOrder(this.allProducts()));
  });
  protected readonly products = computed(() => {
    const byId = new Map(this.allProducts().map(p => [p.id, p]));
    return this.order().map(id => byId.get(id)).filter((p): p is Product => !!p);
  });
  protected readonly residents = toSignal(inject(UserService).list().pipe(map(list => list.filter(u => u.active).sort(byRoom))), {initialValue: []});

  private readonly productId = signal<string | null>(null);
  protected readonly amount = signal(0);
  // In the order they were tapped, which is the order they are named in afterwards.
  private readonly buyerIds = signal<string[]>([]);
  protected readonly product = computed(() => this.allProducts().find(p => p.id === this.productId()) ?? null);
  protected readonly buyers = computed(() => this.buyerIds()
    .map(id => this.residents().find(u => u.id === id)).filter((u): u is User => !!u));
  protected readonly perPerson = computed(() => (this.product()?.price ?? 0) * this.amount());

  // A short confirmation of the last purchase.
  protected readonly confirmation = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;

  // Battles the kitchen is in right now (Kollegiet): a ticker each above the grid.
  private readonly league = inject(LeagueService);
  protected readonly liveBattles = this.league.myLive;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    // A live achievement claimed by this tablet: say it.
    effect(() => {
      const earned = this.league.justEarned();
      if (earned) {
        untracked(() => this.notify.info(`${this.i18n.t('KOL_ACH_ICON_' + earned.code)} ${this.i18n.t('KOL_ACH_UNLOCKED')}: ${this.i18n.t('KOL_ACH_' + earned.code)}`, 6000));
      }
    });
  }

  protected amountOf(product: Product): number {
    return product.id === this.productId() ? this.amount() : 0;
  }

  protected isBuyer(user: User) {
    return this.buyerIds().includes(user.id);
  }

  // Another product starts over at one, as before.
  protected addOne(product: Product) {
    if (product.id !== this.productId()) {
      this.productId.set(product.id);
      this.amount.set(0);
    }
    this.amount.update(n => n + 1);
  }

  protected takeOne(product: Product, event?: Event) {
    event?.preventDefault();
    if (product.id !== this.productId()) {
      return;
    }
    this.amount.update(n => n - 1);
    if (this.amount() <= 0) {
      this.productId.set(null);
    }
  }

  protected toggleBuyer(user: User, event: Event) {
    event.preventDefault();
    this.buyerIds.update(ids => ids.includes(user.id) ? ids.filter(id => id !== user.id) : [...ids, user.id]);
  }

  protected clear() {
    this.productId.set(null);
    this.amount.set(0);
    this.buyerIds.set([]);
  }

  protected buy() {
    const product = this.product(), buyers = this.buyers(), amount = this.amount();
    if (!product || !buyers.length || amount < 1) {
      return;
    }
    this.purchaseService.sell(product, amount, buyers).catch(this.notify.error);
    const t = (k: string) => this.i18n.t(k);
    this.confirm(describeSale(buyers.map(u => u.name), [[amount, product.name]],
      {and: t('BEERSYSTEM_AND'), bought: t('BEERSYSTEM_BOUGHT'), each: t('BUY_EACH')}));
    this.clear();
  }

  protected openHistory() {
    this.bottomSheet.open(HistoryBottomSheetComponent);
  }

  private confirm(text: string) {
    clearTimeout(this.timer);
    this.confirmation.set(text);
    this.timer = setTimeout(() => this.confirmation.set(''), CONFIRM_MS);
  }
}
