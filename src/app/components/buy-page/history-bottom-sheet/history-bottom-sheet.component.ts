import {Component, OnInit} from '@angular/core';
import {Purchase} from '../../../interfaces/purchase';
import {MatBottomSheetRef} from '@angular/material/bottom-sheet';
import {PurchaseService} from '../../../services/purchase.service';
import {map} from 'rxjs/operators';
import {Observable} from 'rxjs';

@Component({
  selector: 'app-history',
  templateUrl: './history-bottom-sheet.component.html',
  styleUrls: ['./history-bottom-sheet.component.scss']
})
export class HistoryBottomSheetComponent implements OnInit {
  purchases!: Observable<Purchase[]>;
  displayedColumns = ['timestamp', 'name', 'amount', 'price', 'user', 'delete'];

  constructor(private purchaseService: PurchaseService, private bottomSheetRef: MatBottomSheetRef<HistoryBottomSheetComponent>) {

  }

  ngOnInit() {
    this.purchases = this.purchaseService.list_newest();
  }

  deletePurchase(purchase: Purchase) {
    this.purchaseService.delete(purchase);
  }
}
