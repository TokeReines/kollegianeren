import {Component, computed, effect, inject, signal, viewChild} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {DecimalPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {switchMap} from 'rxjs';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatTooltipModule} from '@angular/material/tooltip';
import {PurchaseService} from '../../services/purchase.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {sortValue} from '../../table-sort';
import {TranslatePipe} from '../../translate.pipe';
import {AccountRow, accounts} from './accounting';

// Product columns get a prefix, so a product called "name" or "total" cannot clash.
const PRODUCT = 'p:';

// The treasurer's view: what each resident bought in a period, and the total to collect.
@Component({
  selector: 'app-accounting',
  imports: [DecimalPipe, FormsModule, MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatInputModule, MatSortModule,
    MatTableModule, MatTooltipModule, TranslatePipe],
  templateUrl: './accounting.component.html',
  styleUrl: './accounting.component.scss',
})
export class AccountingComponent {
  private readonly i18n = inject(TranslateService);
  private readonly notify = inject(Notify);
  private readonly purchaseService = inject(PurchaseService);

  protected readonly from = signal(monthAgo());
  protected readonly to = signal(new Date());
  private readonly range = computed(() => ({from: this.from(), to: this.to()}));
  private readonly purchases = toSignal(
    toObservable(this.range).pipe(switchMap(({from, to}) => this.purchaseService.between(from, to))), {initialValue: []});
  private readonly accounts = computed(() => accounts(this.purchases()));
  protected readonly productColumns = computed(() => this.accounts().products.map(name => ({id: PRODUCT + name, name})));
  protected readonly displayedColumns = computed(() => ['name', 'room', ...this.productColumns().map(c => c.id), 'total']);
  protected readonly table = new MatTableDataSource<AccountRow>([]);
  private readonly sort = viewChild.required(MatSort);

  protected readonly fromFilter = (date: Date | null) => !date || date <= this.to();
  protected readonly toFilter = (date: Date | null) => !date || date >= this.from();

  constructor() {
    this.table.sortingDataAccessor = (row, column) => column.startsWith(PRODUCT)
      ? row.units[column.slice(PRODUCT.length)] ?? 0
      : sortValue(row[column as 'name' | 'room' | 'total']);
    effect(() => this.table.sort = this.sort());
    effect(() => this.table.data = this.accounts().rows);
  }

  protected async export() {
    const {rows, products} = this.accounts();
    const t = (k: string) => this.i18n.t(k);
    const bold = (value: string) => ({value, fontWeight: 'bold' as const});
    const sheet = [
      [bold(t('NAME')), bold(t('ROOM')), ...products.map(bold), bold(t('BEERSYSTEM_TOTAL'))],
      ...rows.map(r => [r.name, r.room, ...products.map(p => r.units[p] ?? null), r.total]),
    ];
    try {
      // Loaded on first use; only the treasurer ever needs it.
      const {default: writeXlsxFile} = await import('write-excel-file/browser');
      await writeXlsxFile(sheet).toFile(`${isoDate(this.from())}_${isoDate(this.to())}.xlsx`);
    } catch (e) {
      this.notify.error(e);
    }
  }
}

function monthAgo(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
