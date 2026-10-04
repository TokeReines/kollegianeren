import {Component, computed, effect, inject, signal, viewChild} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {DecimalPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {map, switchMap} from 'rxjs';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatMenuModule} from '@angular/material/menu';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {sortValue} from '../../table-sort';
import {TranslatePipe} from '../../translate.pipe';
import type {SheetData} from 'write-excel-file/browser';
import {AccountRow, Period, accounts, kroner, paymentMessage, periodRange, toCsv, toTable} from './accounting';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {UsageService} from '../../services/usage.service';
import {AccountingService} from './accounting.service';

// Product columns get a prefix, so a product called "name" or "total" cannot clash.
const PRODUCT = 'p:';

// The treasurer's view: what each resident bought in a period, and the total to collect.
@Component({
  selector: 'app-accounting',
  imports: [DecimalPipe, FormsModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatDatepickerModule, MatFormFieldModule,
    MatIconModule, MatInputModule, MatMenuModule, MatSortModule, MatTableModule, MatTooltipModule, TranslatePipe],
  templateUrl: './accounting.component.html',
  styleUrl: './accounting.component.scss',
})
export class AccountingComponent {
  private readonly usage = inject(UsageService);
  private readonly i18n = inject(TranslateService);
  private readonly notify = inject(Notify);
  private readonly accounting = inject(AccountingService);

  protected readonly periods: {id: Period, label: string}[] = [
    {id: 'thisMonth', label: 'ACCOUNTING_THIS_MONTH'},
    {id: 'lastMonth', label: 'ACCOUNTING_LAST_MONTH'},
    {id: 'last30', label: 'ACCOUNTING_LAST_30'},
    {id: 'thisYear', label: 'ACCOUNTING_THIS_YEAR'},
  ];
  // A named period, or 'custom' for the dates in the range picker.
  protected readonly period = signal<Period | 'custom'>('last30');
  protected readonly from = signal(periodRange('last30').from);
  protected readonly to = signal(periodRange('last30').to);
  protected readonly show = signal<'units' | 'kr'>('units');
  protected readonly search = signal('');

  private readonly range = computed(() => ({from: this.from(), to: this.to()}));
  private readonly purchases = toSignal(
    toObservable(this.range).pipe(switchMap(({from, to}) => this.accounting.between(from, to))), {initialValue: []});
  protected readonly accounts = computed(() => accounts(this.purchases()));
  protected readonly productColumns = computed(() => this.accounts().products.map(name => ({id: PRODUCT + name, name})));
  protected readonly displayedColumns = computed(() => ['name', 'room', ...this.productColumns().map(c => c.id), 'total', 'paid']);
  protected readonly table = new MatTableDataSource<AccountRow>([]);
  // The table (and its sort) only exists once the period has purchases.
  private readonly sort = viewChild(MatSort);

  // Who has paid for this exact period, and the number the messages ask them to pay to.
  private readonly settlement = toSignal(
    toObservable(this.range).pipe(switchMap(({from, to}) => this.accounting.settlement(from, to))), {initialValue: null});
  protected readonly mobilePay = toSignal(this.accounting.settings$.pipe(map(s => s?.mobilePay ?? '')), {initialValue: ''});
  // Only the residents who still owe (or have money to get back).
  protected readonly unpaidOnly = signal(false);
  // Residents with something to settle, and how many of them have.
  private readonly owing = computed(() => this.accounts().rows.filter(r => r.total !== 0));
  protected readonly paidCount = computed(() => this.owing().filter(r => this.paid(r)).length);
  protected readonly owingCount = computed(() => this.owing().length);
  protected readonly outstanding = computed(() => this.owing().filter(r => !this.paid(r)).reduce((sum, r) => sum + r.total, 0));

  constructor() {
    this.table.sortingDataAccessor = (row, column) => column.startsWith(PRODUCT)
      ? (this.show() === 'units' ? row.units : row.kr)[column.slice(PRODUCT.length)] ?? 0
      : column === 'paid' ? (this.paid(row) ? 1 : 0)
      : sortValue(row[column as 'name' | 'room' | 'total']);
    this.table.filterPredicate = (row, term) => `${row.name} ${row.room}`.toLocaleLowerCase('da').includes(term);
    effect(() => this.table.sort = this.sort() ?? null);
    effect(() => this.table.data = this.unpaidOnly() ? this.owing().filter(r => !this.paid(r)) : this.accounts().rows);
    effect(() => this.table.filter = this.search().trim().toLocaleLowerCase('da'));
  }

  protected paid(row: AccountRow) {
    return this.settlement()?.paid?.[row.userId] ?? null;
  }

  // Ticked for an amount that has changed since (a purchase added or taken back later).
  protected changed(row: AccountRow) {
    const p = this.paid(row);
    return !!p && Math.abs(p.kr - row.total) >= 0.005;
  }

  protected changedText(row: AccountRow) {
    const p = this.paid(row);
    return p ? this.i18n.t('ACCOUNTING_PAID_CHANGED').replace('{paid}', kroner(p.kr)).replace('{now}', kroner(row.total)) : '';
  }

  protected togglePaid(row: AccountRow, paid: boolean) {
    this.accounting.setPaid(this.from(), this.to(), row.userId, paid ? row.total : null).catch(this.notify.error);
  }

  protected copyMessage(row: AccountRow) {
    this.usage.act('accounting-message');
    const period = `${this.from().getDate()}/${this.from().getMonth() + 1} ${this.i18n.t('FOOD_TO')} ${this.to().getDate()}/${this.to().getMonth() + 1}`;
    this.notify.copy(paymentMessage(row, period, this.mobilePay(), k => this.i18n.t(k)), this.i18n.t('ACCOUNTING_MESSAGE_COPIED'));
  }

  protected saveMobilePay(value: string) {
    if (value.trim() !== this.mobilePay()) {
      this.accounting.saveMobilePay(value).catch(this.notify.error);
    }
  }

  protected choose(period: Period | 'custom') {
    this.period.set(period);
    if (period !== 'custom') {
      const {from, to} = periodRange(period);
      this.from.set(from);
      this.to.set(to);
    }
  }

  // The range picker reports the start date first, then the end date.
  private pickedFrom: Date | null = null;

  protected startPicked(from: Date | null) {
    this.pickedFrom = from;
  }

  protected endPicked(to: Date | null) {
    const from = this.pickedFrom ?? this.from();
    if (to && from <= to) {
      this.period.set('custom');
      this.from.set(from);
      this.to.set(to);
      this.pickedFrom = null;
    }
  }

  // Exports what is shown: counts or kroner per product, residents matching the search.
  private sheet() {
    const t = (k: string) => this.i18n.t(k);
    const a = this.accounts();
    const visible = new Set(this.table.filteredData.map(r => r.userId));
    return toTable({...a, rows: a.rows.filter(r => visible.has(r.userId))}, this.show(),
      {name: t('NAME'), room: t('ROOM'), total: t('ACCOUNTING_TOTAL_KR'), sum: t('ACCOUNTING_SUM')});
  }

  private fileName(ext: string) {
    return `${this.i18n.t('ACCOUNTING_FILE')}_${isoDate(this.from())}_${isoDate(this.to())}.${ext}`;
  }

  protected exportCsv() {
    this.usage.act('accounting-csv');
    const blob = new Blob([toCsv(this.sheet())], {type: 'text/csv;charset=utf-8'});
    const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: this.fileName('csv')});
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  protected async exportXlsx() {
    this.usage.act('accounting-xlsx');
    const {header, rows, footer} = this.sheet();
    const bold = (value: string | number | null) => ({value: value ?? '', fontWeight: 'bold' as const});
    const data: SheetData = [header.map(bold), ...rows, footer.map(bold)];
    try {
      // Loaded on first use; only the treasurer ever needs it.
      const {default: writeXlsxFile} = await import('write-excel-file/browser');
      await writeXlsxFile(data).toFile(this.fileName('xlsx'));
    } catch (e) {
      this.notify.error(e);
    }
  }
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
