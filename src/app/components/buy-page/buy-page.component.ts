import {Component, OnInit} from '@angular/core';
import {ProductService} from '../../services/product.service';
import {BuyableProduct} from '../../models/buyable-product';
import {BuyableUser} from '../../models/buyable-user';
import {UserService} from '../../services/user.service';
import {Purchase} from '../../interfaces/purchase';
import {PurchaseService} from '../../services/purchase.service';
import {MatBottomSheet} from '@angular/material/bottom-sheet';
import {MatSnackBar} from '@angular/material/snack-bar';
import {HistoryBottomSheetComponent} from './history-bottom-sheet/history-bottom-sheet.component';
import { Product } from 'src/app/interfaces/product';
import { Cloudinary, CloudinaryImage } from '@cloudinary/url-gen';
import {fill} from "@cloudinary/url-gen/actions/resize";

@Component({
  selector: 'app-buy-page',
  templateUrl: './buy-page.component.html',
  styleUrls: ['./buy-page.component.scss']
})
export class BuyPageComponent implements OnInit {
  products: Array<BuyableProduct> = new Array<BuyableProduct>();
  users!: Array<BuyableUser>;
  selectedProduct?: BuyableProduct | null;
  selectedUsers: Array<BuyableUser> = [];  
  cloudinary!: Cloudinary;
  img!: CloudinaryImage;

  constructor(private productService: ProductService, private userService: UserService, private purchaseService: PurchaseService,
              public snackBar: MatSnackBar, private historyBottomSheet: MatBottomSheet) {
  }

  ngOnInit() {
    this.cloudinary = new Cloudinary({
      cloud:  {
        cloudName: 'egmontkollegiet-dev',
        apiKey: '847733283445576',
        apiSecret: 'oWrtkHnYekzL1ba-ks537vnWUXg'
      }
    });
    this.img = this.cloudinary.image('f6x5ucmrcnccgyp7xxm').resize(fill(100, 100));

    this.productService.list().subscribe(result => {
      result.filter(product => product.active).sort((p1, p2) => {
        return p1.name.localeCompare(p2.name);
      }).forEach(p => {
        this.products.push( new BuyableProduct(p));
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

  selectUser(user: any, event: MouseEvent) {
    event.preventDefault();
    if (!user.selected) {
      this.selectedUsers.push(user);
    } else {
      this.selectedUsers.splice(this.selectedUsers.indexOf(user), 1);
    }
    user.selected = !user.selected;
  }

  deselectProduct(product: BuyableProduct, event: MouseEvent) {
    event.preventDefault();
    if (product.amount > 0) {
      product.amount--;
    }

    if (product.amount === 0) {
      this.selectedProduct = null;
      product.selected = false;
    }
  }

  selectProduct(product: BuyableProduct) {
    this.selectedProduct = product;
    product.amount++;
    product.selected = true;

    this.products.filter(p => p !== product).forEach(p => {
      if (p !== product) {
        p.selected = false;
        p.amount = 0;
      }
    });
  }

  cancel() {
    this.products.forEach(p => {
      p.selected = false;
      p.amount = 0;
    });
    this.users.forEach(u => {
      u.selected = false;
    });
    this.selectedUsers = [];
    this.selectedProduct = null;
  }

  purchase() {
    const users = [];
    if (this.selectedUsers.length === 0) {
      return;
    }

    if (!this.selectedProduct) {
      return;
    }

    this.selectedUsers.forEach(user => {
      const p = <Purchase>{
        productName: this.selectedProduct!.name,
        productId: this.selectedProduct!.id,
        amount: this.selectedProduct!.amount,
        price: this.selectedProduct!.price * this.selectedProduct!.amount,
        userId: user.id,
        userName: user.name,
        userRoom: user.room
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
