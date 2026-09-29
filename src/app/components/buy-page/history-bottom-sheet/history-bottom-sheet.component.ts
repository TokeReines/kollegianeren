import {Component, DestroyRef, ElementRef, effect, inject, signal, viewChild} from '@angular/core';
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
// Material 3 removal: the row is marked red for a moment (so it is clear which one goes), slides
// out while fading (emphasized accelerate), then the rows below glide up (emphasized decelerate).
const MARK_MS = 300;
const EXIT = {duration: 200, easing: 'cubic-bezier(0.3, 0, 0.8, 0.15)'};
const CLOSE_GAP = {duration: 300, easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)'};

// "Seneste køb": the latest purchases. Here a wrong purchase is taken back: by the tablet within
// a minute, by the treasurer or owner at any time.
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
  // Rows being taken back, while they are marked.
  protected readonly removing = signal<ReadonlySet<string>>(new Set());
  // Rows stay the same elements across updates, so the ones below a removed row can be moved.
  protected readonly trackById = (_: number, p: Purchase) => p.id;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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

  protected async remove(p: Purchase) {
    const t = (k: string) => this.i18n.t(k);
    const ok = await this.confirm.ask({
      title: t('HISTORY_UNDO_TITLE'), message: `${p.amount} × ${p.productName}, ${p.userName}`,
      confirm: t('HISTORY_UNDO_CONFIRM'), cancel: t('HISTORY_KEEP'),
    });
    if (!ok) {
      return;
    }
    const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.removing.update(ids => new Set([...ids, p.id]));
    const row = this.row(p.id);
    if (animate && row) {
      await new Promise(done => setTimeout(done, MARK_MS));
      await row.animate([{transform: 'none', opacity: 1}, {transform: 'translateX(48px)', opacity: 0}], {...EXIT, fill: 'forwards'}).finished;
    }
    const before = this.rowTops();
    // The row leaves the list as soon as the delete is made locally; the promise waits for the server.
    this.purchaseService.remove(p, this.products().find(x => x.id === p.productId)).then(
      () => this.notify.info(t('BEERSYSTEM_UNDONE')),
      e => {
        this.removing.update(ids => new Set([...ids].filter(id => id !== p.id)));
        this.row(p.id)?.getAnimations().forEach(a => a.cancel());
        this.notify.error(e);
      });
    if (animate) {
      await this.closeGap(p.id, before);
    }
  }

  private row(id: string): HTMLElement | null {
    return this.host.nativeElement.querySelector(`tr[data-id="${id}"]`);
  }

  private rowTops(): Map<string, number> {
    const rows = this.host.nativeElement.querySelectorAll<HTMLElement>('tr[data-id]');
    return new Map([...rows].map(r => [r.dataset['id'] ?? '', r.getBoundingClientRect().top]));
  }

  // Once the removed row is gone, the rows that moved up start where they were and glide there.
  private async closeGap(removedId: string, before: Map<string, number>) {
    for (let i = 0; i < 60 && this.row(removedId); i++) {
      await new Promise(requestAnimationFrame);
    }
    for (const [id, top] of this.rowTops()) {
      const dy = (before.get(id) ?? top) - top;
      if (dy) {
        this.row(id)?.animate([{transform: `translateY(${dy}px)`}, {transform: 'none'}], CLOSE_GAP);
      }
    }
  }
}
