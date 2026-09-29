import {AfterViewInit, ChangeDetectionStrategy, Component, OnDestroy, ViewChild} from '@angular/core';
import {MatSort} from '@angular/material/sort';
import {MatTableDataSource} from '@angular/material/table';
import {Subscription} from 'rxjs';
import {Purchase} from '../../../interfaces/purchase';
import {PurchaseService} from '../../../services/purchase.service';
import {AuthService} from '../../../services/auth.service';
import {TranslateService} from '../../../services/translate.service';
import {MatSnackBar} from '@angular/material/snack-bar';
import {Confirm} from '../../confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-history',
  templateUrl: './history-bottom-sheet.component.html',
  styleUrls: ['./history-bottom-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class HistoryBottomSheetComponent implements AfterViewInit, OnDestroy {
  purchases = new MatTableDataSource<Purchase>([]);
  displayedColumns = ['timestamp', 'name', 'amount', 'price', 'user', 'delete'];
  @ViewChild(MatSort) sort: MatSort;
  private sub: Subscription;
  private roleSub: Subscription;

  constructor(public purchaseService: PurchaseService, auth: AuthService, private confirm: Confirm,
              private translate: TranslateService, private snackBar: MatSnackBar) {
    this.roleSub = auth.role.subscribe(role => this.displayedColumns = ['timestamp', 'name', 'amount', 'price', 'user', ...(role === 'tablet' ? [] : ['delete'])]);
    // Column ids differ from the field names, and time sorts by value, not by its text.
    this.purchases.sortingDataAccessor = (p, column) => {
      switch (column) {
        case 'timestamp': return p.timestamp?.toMillis?.() || 0;
        case 'name': return (p.productName || '').toLowerCase();
        case 'user': return (p.userName || '').toLowerCase();
        case 'amount': return Number(p.amount) || 0;
        case 'price': return Number(p.price) || 0;
        default: return '';
      }
    };
    this.sub = this.purchaseService.list_newest().subscribe(list => this.purchases.data = list);
  }

  async remove(p: Purchase) {
    const t = (k: string) => this.translate.data[k] || k;
    const ok = await this.confirm.ask({
      title: t('HISTORY_DELETE_TITLE'), message: `${p.amount} × ${p.productName}, ${p.userName}`, confirm: t('DELETE'), danger: true,
    });
    if (ok) {
      this.purchaseService.delete(p).catch(e => this.snackBar.open(e.message, 'OK', {duration: 6000}));
    }
  }

  ngAfterViewInit() {
    this.purchases.sort = this.sort;
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    this.roleSub.unsubscribe();
  }
}
