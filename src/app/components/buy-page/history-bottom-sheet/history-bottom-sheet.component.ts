import {Component, computed, effect, inject, viewChild} from '@angular/core';
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
import {PurchaseService} from '../../../services/purchase.service';
import {TranslateService} from '../../../services/translate.service';
import {sortValue} from '../../../table-sort';
import {TranslatePipe} from '../../../translate.pipe';
import {Confirm} from '../../confirm-dialog/confirm-dialog.component';

// The latest purchases, from the buy page. Managers can delete one; tablets only look.
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
  private readonly sort = viewChild.required(MatSort);
  protected readonly table = new MatTableDataSource<Purchase>([]);
  protected readonly displayedColumns = computed(() =>
    ['timestamp', 'name', 'amount', 'price', 'user', ...(this.auth.canManage() ? ['delete'] : [])]);

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
  }

  protected async remove(p: Purchase) {
    const t = (k: string) => this.i18n.t(k);
    if (await this.confirm.ask({title: t('HISTORY_DELETE_TITLE'), message: `${p.amount} × ${p.productName}, ${p.userName}`, confirm: t('DELETE'), danger: true})) {
      this.purchaseService.delete(p).catch(this.notify.error);
    }
  }
}
