import {Component, computed, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DecimalPipe} from '@angular/common';
import {map} from 'rxjs';
import {MatBadgeModule} from '@angular/material/badge';
import {MatBottomSheet} from '@angular/material/bottom-sheet';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Product, byName, tracksStock} from '../../interfaces/product';
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

// How long a purchase can be taken back from the buy screen.
const UNDO_MS = 30000;

// The tablet's screen: tap a product (again for more), tap one or more residents, buy.
// Right-click (long press) a product to take one off.
@Component({
  selector: 'app-buy-page',
  imports: [DecimalPipe, MatBadgeModule, MatButtonModule, MatCardModule, MatIconModule, MatTooltipModule, TranslatePipe,
    ProductPictureComponent, ResidentAvatarComponent],
  templateUrl: './buy-page.component.html',
  styleUrl: './buy-page.component.scss',
})
export class BuyPageComponent {
  private readonly productService = inject(ProductService);
  private readonly purchaseService = inject(PurchaseService);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(TranslateService);
  private readonly bottomSheet = inject(MatBottomSheet);

  protected readonly products = toSignal(this.productService.list().pipe(map(list => list.filter(p => p.active).sort(byName))), {initialValue: []});
  protected readonly residents = toSignal(inject(UserService).list().pipe(map(list => list.filter(u => u.active).sort(byRoom))), {initialValue: []});

  private readonly productId = signal<string | null>(null);
  protected readonly amount = signal(0);
  // In the order they were tapped, which is the order they are named in afterwards.
  private readonly residentIds = signal<string[]>([]);
  protected readonly product = computed(() => this.products().find(p => p.id === this.productId()) ?? null);
  protected readonly buyers = computed(() => this.residentIds()
    .map(id => this.residents().find(u => u.id === id)).filter((u): u is User => !!u));

  protected isSelected(product: Product) {
    return product.id === this.productId();
  }

  protected isBuyer(user: User) {
    return this.residentIds().includes(user.id);
  }

  protected addOne(product: Product) {
    if (!this.isSelected(product)) {
      this.productId.set(product.id);
      this.amount.set(0);
    }
    this.amount.update(n => n + 1);
  }

  protected takeOne(product: Product, event: Event) {
    event.preventDefault();
    if (!this.isSelected(product)) {
      return;
    }
    this.amount.update(n => n - 1);
    if (this.amount() <= 0) {
      this.productId.set(null);
    }
  }

  protected toggleBuyer(user: User, event: Event) {
    event.preventDefault();
    this.residentIds.update(ids => ids.includes(user.id) ? ids.filter(id => id !== user.id) : [...ids, user.id]);
  }

  protected cancel() {
    this.productId.set(null);
    this.amount.set(0);
    this.residentIds.set([]);
  }

  protected purchase() {
    const product = this.product();
    const buyers = this.buyers();
    const amount = this.amount();
    if (!product || !buyers.length || amount < 1) {
      return;
    }
    const t = (key: string) => this.i18n.t(key);
    const writes = buyers.map(user => this.purchaseService.add({
      productId: product.id, productName: product.name, amount, price: product.price * amount,
      userId: user.id, userName: user.name, userRoom: user.room,
    }));
    const sold = amount * buyers.length;
    if (tracksStock(product)) {
      this.productService.adjustStock(product.id, -sold).catch(() => undefined);
    }
    const message = buyers.map(u => u.name).join(t('BEERSYSTEM_AND')) + t('BEERSYSTEM_BOUGHT') + amount + ' ' + product.name;
    // Wrong tap? The purchase can be taken back for a short while, straight from the buy screen.
    // Deletes queue like any other write, so this works offline too.
    this.notify.action(message, t('BEERSYSTEM_UNDO'), UNDO_MS).subscribe(() => {
      if (tracksStock(product)) {
        this.productService.adjustStock(product.id, sold).catch(() => undefined);
      }
      Promise.all(writes.map(w => this.purchaseService.delete(w.ref)))
        .then(() => this.notify.info(t('BEERSYSTEM_UNDONE')), this.notify.error);
    });
    this.cancel();
  }

  protected openHistory() {
    this.bottomSheet.open(HistoryBottomSheetComponent);
  }
}
