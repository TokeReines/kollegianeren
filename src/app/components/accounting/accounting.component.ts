import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {PurchaseService} from '../../services/purchase.service';
import {MatSort} from '@angular/material/sort';
import {MatTableDataSource} from '@angular/material/table';
import {ExcelService} from '../../services/excel.service';
import {PdfService} from '../../services/pdf.service';

@Component({
  selector: 'app-accounting',
  templateUrl: './accounting.component.html',
  styleUrls: ['./accounting.component.scss']
})
export class AccountingComponent implements OnInit {
  from_date = new Date();
  to_date = new Date();
  dataSource!: MatTableDataSource<any>;
  displayedColumns: any;

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('accountingTable') accountingTable: any;

  constructor(private purchaseService: PurchaseService, private excelService: ExcelService, private pdfService: PdfService) {
    this.from_date.setMonth(this.from_date.getMonth() - 1);
  }

  ngOnInit() {
    this._setTableData();
  }

  _setTableData() {
    this.purchaseService.list_from_to(this.from_date, this.to_date).valueChanges().subscribe(purchases => {
      const rows: any[] = [];
      let columns = ['name', 'room'];
      const formatted_rows: any = {};
      purchases.map(purchase => {
        if (!(purchase.userId in formatted_rows)) {
          formatted_rows[purchase.userId] = {
            userId: purchase.userId,
            name: purchase.userName,
            room: purchase.userRoom,
            products: {},
            total: 0
          };
        }
        const products = formatted_rows[purchase.userId]['products'];
        if (!(purchase.productName in products)) {
          products[purchase.productName] = {name: purchase.productName, amount: purchase.amount, price: purchase.price};
        } else {
          products[purchase.productName]['amount'] += purchase.amount;
        }

        formatted_rows[purchase.userId]['total'] += purchase.price;
      });
      const product_columns: any = [];
      Object.keys(formatted_rows).forEach(userId => {
        const value = formatted_rows[userId];
        const row: any = {name: value['name'], room: value['room'], total: parseFloat(value['total']).toFixed(2)};
        Object.keys(value['products']).forEach(key => {
          const product = value['products'][key];
          row[product.name] = product['amount'];
          if (!product_columns.includes(product.name)) {
            product_columns.push(product.name);
          }
        });
        rows.push(row);
      });
      product_columns.sort();
      columns = columns.concat(product_columns);
      columns.push('total');
      this.displayedColumns = columns;
      this.dataSource = new MatTableDataSource(rows);
      this.dataSource.sort = this.sort;
    });
  }

  exportAsXLSX(): void {
    const name = this.from_date.toLocaleDateString() + '_' + this.to_date.toLocaleDateString();
    this.excelService.exportAsExcelFile(this.dataSource.data, name);
  }

  exportAsPdf(): void {
    const table = document.getElementById('accountingTable');
    console.log(table);
    console.log(table!.innerHTML);
    console.log(this.accountingTable._element);
    this.pdfService.exportAsPdfFile(table!.innerHTML, this.dataSource.data, 'tats');
  }

  fromDateFilter = (date: Date): boolean => {
    return !this.to_date || date <= this.to_date;
  };

  toDateFilter = (date: Date): boolean => {
    return !this.from_date || date >= this.from_date;
  };

  fromDateChange() {
    this._setTableData();
  }

  toDateChange() {
    this._setTableData();
  }

}
