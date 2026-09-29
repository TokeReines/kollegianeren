import {Component, DestroyRef, effect, inject, signal, viewChild} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DatePipe, DecimalPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {Purchase} from '../../../interfaces/purchase';
import {millis} from '../../../time';
import {AuthService} from '../../../services/auth.service';
import {Notify} from '../../../services/notify.service';
import {ProductService} from '../../../services/product.service';
import {PurchaseService} from '../../../services/purchase.service';
import {TranslateService} from '../../../services/translate.service';
import {sortValue} from '../../../table-sort';
import {TranslatePipe} from '../../../translate.pipe';
import {Confirm} from '../../confirm-dialog/confirm-dialog.component';

// A tablet may take a purchase back this long after it was made (firestore.rules allows 60 s).
const TABLET_UNDO_MS = 55e3;

// "Seneste køb": the latest purchases. Here a wrong purchase is taken back: by the tablet within
// a minute, by the treasurer or owner at any time. A row from a basket can take the whole basket.
@Component({
  selector: 'app-history',
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatIconModule, MatSortModule, MatTableModule, TranslatePipe],
  templateUrl: './history-bottom-sheet.component.html',
  styleUrl: './history-bottom-sheet.component.scss',
})
export class HistoryBottomSheetComponent {
  private readonly purchaseService = inject(PurchaseService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(Confirm);
  private readonly i18n = inject(TranslateService);
  private readonly notify = inject(Notify);

  private readonly purchases = toSignal(this.purchaseService.newest(), {initialValue: []});
  private readonly products = toSignal(inject(ProductService).list(), {initialValue: []});
  private readonly sort = viewChild.required(MatSort);
  protected readonly table = new MatTableDataSource<Purchase>([]);
  protected readonly displayedColumns = ['timestamp', 'name', 'amount', 'price', 'user', 'undo'];
  protected readonly canManage = this.auth.canManage;
  // Ticks, so the tablet's undo buttons disappear when their minute is up.
  private readonly now = signal(Date.now());

  constructor() {
    // Column ids differ from the field names, and time sorts by value, not by its text.
    this.table.sortingDataAccessor = (p, column) => {
      switch (column) {
        case 'timestamp': return millis(p.timestamp);
        case 'name': return sortValue(p.productName);
        case 'user': return sortValue(p.userName);
        default: return Number(p[column as 'amount' | 'price']) || 0;
      }
    };
    effect(() => this.table.sort = this.sort());
    effect(() => this.table.data = this.purchases());
    const timer = setInterval(() => this.now.set(Date.now()), 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected canUndo(p: Purchase): boolean {
    return this.canManage() || this.now() - millis(p.timestamp) < TABLET_UNDO_MS;
  }

  // The other rows of the same basket that may still be taken back.
  private basketOf(p: Purchase): Purchase[] {
    return p.saleId ? this.purchases().filter(q => q.saleId === p.saleId && this.canUndo(q)) : [p];
  }

  protected async remove(p: Purchase) {
    const t = (k: string) => this.i18n.t(k);
    const line = (q: Purchase) => `${q.amount} × ${q.productName}, ${q.userName}`;
    const basket = this.basketOf(p);
    let chosen: Purchase[] = [];
    if (basket.length > 1) {
      const answer = await this.confirm.choose({
        title: t('HISTORY_UNDO_TITLE'), message: basket.map(line).join('\n'),
        confirm: `${t('HISTORY_UNDO_BASKET')} (${basket.length})`, alternative: t('HISTORY_UNDO_ONE'), cancel: t('HISTORY_KEEP'), danger: true,
      });
      chosen = answer === 'confirm' ? basket : answer === 'alternative' ? [p] : [];
    } else if (await this.confirm.ask({title: t('HISTORY_UNDO_TITLE'), message: line(p), confirm: t('BEERSYSTEM_UNDO'), cancel: t('HISTORY_KEEP'), danger: true})) {
      chosen = [p];
    }
    if (chosen.length) {
      this.purchaseService.remove(chosen, this.products())
        .then(() => this.notify.info(t('BEERSYSTEM_UNDONE')), this.notify.error);
    }
  }
}
