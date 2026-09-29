import {Component, DestroyRef, computed, inject, signal, untracked} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DecimalPipe} from '@angular/common';
import {map} from 'rxjs';
import {MatBadgeModule} from '@angular/material/badge';
import {MatBottomSheet} from '@angular/material/bottom-sheet';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Product} from '../../interfaces/product';
import {User, byRoom} from '../../interfaces/user';
import {ProductService} from '../../services/product.service';
import {PurchaseService, Sale} from '../../services/purchase.service';
import {UserService} from '../../services/user.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {ProductPictureComponent} from '../shared/product-picture.component';
import {ResidentAvatarComponent} from '../shared/resident-avatar.component';
import {HistoryBottomSheetComponent} from './history-bottom-sheet/history-bottom-sheet.component';
import {basketTotals, describeSale, productOrder} from './basket';

// How long a purchase can be taken back from the buy screen (the rules allow a minute).
const UNDO_S = 30;

// The tablet's screen. Tap products to fill a basket (tap again for more), tap one or more
// residents, buy: every chosen resident gets the whole basket. Right-click or long-press a
// product to take one off. The last purchase can be taken back from the bar at the bottom.
@Component({
  selector: 'app-buy-page',
  imports: [DecimalPipe, MatBadgeModule, MatButtonModule, MatCardModule, MatIconModule, MatTooltipModule, TranslatePipe,
    ProductPictureComponent, ResidentAvatarComponent],
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

  // productId -> amount, in the order they were first tapped.
  private readonly basket = signal<[string, number][]>([]);
  // In the order they were tapped, which is the order they are named in afterwards.
  private readonly buyerIds = signal<string[]>([]);
  protected readonly lines = computed(() => this.basket()
    .map(([id, amount]) => ({product: this.allProducts().find(p => p.id === id), amount}))
    .filter((l): l is {product: Product, amount: number} => !!l.product));
  protected readonly buyers = computed(() => this.buyerIds()
    .map(id => this.residents().find(u => u.id === id)).filter((u): u is User => !!u));
  protected readonly totals = computed(() => basketTotals(this.lines(), this.buyers().length));

  // The last purchase, with a countdown for its undo.
  protected readonly lastSale = signal<{text: string, sale: Sale, secondsLeft: number} | null>(null);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  protected amountOf(product: Product): number {
    return this.basket().find(([id]) => id === product.id)?.[1] ?? 0;
  }

  protected isBuyer(user: User) {
    return this.buyerIds().includes(user.id);
  }

  protected add(product: Product, n = 1) {
    this.basket.update(lines => {
      const i = lines.findIndex(([id]) => id === product.id);
      if (i < 0) {
        return n > 0 ? [...lines, [product.id, n]] : lines;
      }
      const amount = lines[i][1] + n;
      return amount > 0 ? lines.map((l, j) => j === i ? [l[0], amount] as [string, number] : l) : lines.filter((_, j) => j !== i);
    });
  }

  protected takeOne(product: Product, event: Event) {
    event.preventDefault();
    this.add(product, -1);
  }

  protected toggleBuyer(user: User, event: Event) {
    event.preventDefault();
    this.buyerIds.update(ids => ids.includes(user.id) ? ids.filter(id => id !== user.id) : [...ids, user.id]);
  }

  protected clear() {
    this.basket.set([]);
    this.buyerIds.set([]);
  }

  protected buy() {
    const lines = this.lines(), buyers = this.buyers();
    if (!lines.length || !buyers.length) {
      return;
    }
    const sale = this.purchaseService.sell(lines, buyers);
    sale.saved.catch(this.notify.error);
    const t = (k: string) => this.i18n.t(k);
    this.showLastSale(describeSale(buyers.map(u => u.name), lines.map(l => [l.amount, l.product.name]),
      {and: t('BEERSYSTEM_AND'), bought: t('BEERSYSTEM_BOUGHT'), each: t('BUY_EACH')}), sale);
    this.clear();
  }

  // Deletes queue like any other write, so this works offline too.
  protected undo() {
    const last = this.lastSale();
    if (!last) {
      return;
    }
    this.hideLastSale();
    this.purchaseService.unsell(last.sale).then(() => this.notify.info(this.i18n.t('BEERSYSTEM_UNDONE')), this.notify.error);
  }

  protected openHistory() {
    this.bottomSheet.open(HistoryBottomSheetComponent);
  }

  private showLastSale(text: string, sale: Sale) {
    clearInterval(this.timer);
    this.lastSale.set({text, sale, secondsLeft: UNDO_S});
    this.timer = setInterval(() => {
      const last = this.lastSale();
      if (!last || last.secondsLeft <= 1) {
        this.hideLastSale();
      } else {
        this.lastSale.set({...last, secondsLeft: last.secondsLeft - 1});
      }
    }, 1000);
  }

  private hideLastSale() {
    clearInterval(this.timer);
    this.lastSale.set(null);
  }
}
