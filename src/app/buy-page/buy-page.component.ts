import {Component, OnInit} from '@angular/core';
import {ProductService} from '../core/services/product.service';
import {BuyableProduct} from '../core/models/buyable-product';
import {BuyableUser} from '../core/models/buyable-user';
import {UserService} from '../core/services/user.service';
import {Purchase} from '../core/interfaces/purchase';
import {PurchaseService} from '../core/services/purchase.service';
import {MatBottomSheet, MatSnackBar} from '@angular/material';
import {HistoryBottomSheetComponent} from './history-bottom-sheet/history-bottom-sheet.component';

@Component({
  selector: 'app-buy-page',
  templateUrl: './buy-page.component.html',
  styleUrls: ['./buy-page.component.scss']
})
export class BuyPageComponent implements OnInit {
  products: Array<BuyableProduct>;
  users: Array<BuyableUser>;
  selectedProduct: BuyableProduct;
  selectedUsers: Array<BuyableUser> = [];

  constructor(private productService: ProductService, private userService: UserService, private purchaseService: PurchaseService,
              public snackBar: MatSnackBar, private historyBottomSheet: MatBottomSheet) {
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
    const users = [];
    this.selectedUsers.forEach(user => {
      const p = <Purchase>{
        product_name: this.selectedProduct.name,
        product_id: this.selectedProduct.id,
        amount: this.selectedProduct.amount,
        price: this.selectedProduct.price * this.selectedProduct.amount,
        user_id: user.id,
        user_name: user.name,
        user_room: user.room
      };
      users.push(user.name);
      this.purchaseService.add(p);
    });
    this.snackBar.open(this.selectedUsers.map(u => u.name).join(' og ') + ' købte ' +
      this.selectedProduct.amount + ' ' + this.selectedProduct.name, 'Nice!', {
      duration: 4000,
    });
    this.cancel();
  }

  openHistorySheet(): void {
    this.historyBottomSheet.open(HistoryBottomSheetComponent);
  }
}
