import {Component, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {ProductService} from '../../services/product.service';
import {BuyableProduct} from '../../models/buyable-product';
import {BuyableUser} from '../../models/buyable-user';
import {UserService} from '../../services/user.service';
import {Purchase} from '../../interfaces/purchase';
import {PurchaseService} from '../../services/purchase.service';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatSnackBar } from '@angular/material/snack-bar';
import {HistoryBottomSheetComponent} from './history-bottom-sheet/history-bottom-sheet.component';
import {TranslateService} from '../../services/translate.service';

// How long a purchase can be taken back from the buy screen.
const UNDO_MS = 30000;

@Component({
    selector: 'app-buy-page',
    templateUrl: './buy-page.component.html',
    styleUrls: ['./buy-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class BuyPageComponent implements OnInit {
  products: Array<BuyableProduct>;
  users: Array<BuyableUser>;
  selectedProduct: BuyableProduct;
  selectedUsers: Array<BuyableUser> = [];

  constructor(private productService: ProductService, private userService: UserService, private purchaseService: PurchaseService,
              public snackBar: MatSnackBar, private historyBottomSheet: MatBottomSheet, private translate: TranslateService) {
  }

  ngOnInit() {
    this.productService.list().subscribe(result => {
      this.products = new Array<BuyableProduct>();
      result.filter(product => product.active).sort((p1, p2) => {
        return p1.name.localeCompare(p2.name);
      }).forEach(p => {
        this.products.push(new BuyableProduct(p));
      });
    });
    this.userService.list().subscribe(result => {
      this.users = new Array<BuyableUser>();
      result.filter(user => user.active).sort((u1, u2) => {
        return u1.room.localeCompare(u2.room);
      }).forEach(p => {
        this.users.push(new BuyableUser(p));
      });
    });
  }

  selectUser(user, event) {
    event.preventDefault();
    if (!user.selected) {
      this.selectedUsers.push(user);
    } else {
      this.selectedUsers.splice(this.selectedUsers.indexOf(user), 1);
    }
    user.selected = !user.selected;
  }

  deselectProduct(product, event) {
    event.preventDefault();
    if (product.amount > 0) {
      product.amount--;
    }

    if (product.amount === 0) {
      this.selectedProduct = null;
      product.amount = null;
      product.selected = false;
    }
  }

  selectProduct(product) {
    this.selectedProduct = product;
    product.amount++;
    product.selected = true;

    this.products.filter(p => p !== product).forEach(p => {
      if (p !== product) {
        p.selected = false;
        p.amount = null;
      }
    });
  }

  cancel() {
    this.products.forEach(p => {
      p.selected = false;
      p.amount = null;
    });
    this.users.forEach(u => {
      u.selected = false;
    });
    this.selectedUsers = [];
    this.selectedProduct = null;
  }

  purchase() {
    const t = (key: string) => this.translate.data[key] || key;
    const writes = this.selectedUsers.map(user => {
      const p = <Purchase>{
        productName: this.selectedProduct.name,
        productId: this.selectedProduct.id,
        amount: this.selectedProduct.amount,
        price: this.selectedProduct.price * this.selectedProduct.amount,
        userId: user.id,
        userName: user.name,
        userRoom: user.room
      };
      return this.purchaseService.add(p);
    });
    const message = this.selectedUsers.map(u => u.name).join(t('BEERSYSTEM_AND')) + t('BEERSYSTEM_BOUGHT') +
      this.selectedProduct.amount + ' ' + this.selectedProduct.name;
    // Wrong tap? The purchase can be taken back for a short while, straight from the buy screen.
    this.snackBar.open(message, t('BEERSYSTEM_UNDO'), {duration: UNDO_MS}).onAction().subscribe(() => {
      Promise.all(writes)
        .then(refs => Promise.all(refs.map(ref => this.purchaseService.deleteRef(ref))))
        .then(() => this.snackBar.open(t('BEERSYSTEM_UNDONE'), undefined, {duration: 4000}),
          err => this.snackBar.open(err.message, 'OK', {duration: 6000}));
    });
    this.cancel();
  }

  openHistorySheet(): void {
    this.historyBottomSheet.open(HistoryBottomSheetComponent);
  }
}
