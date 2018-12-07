import {Product} from '../interfaces/product';

export class BuyableProduct implements Product {
  selected: boolean;
  amount: number;
  active: boolean;
  id: string;
  image: string;
  name: string;
  price: number;
  retailPrice: number;
  clId: string;

  constructor(product: Product) {
    this.selected = false;
    this.amount = null;
    this.active = product.active;
    this.id = product.id;
    this.image = product.image;
    this.name = product.name;
    this.price = product.price;
    this.retailPrice = product.retailPrice;
    this.clId = product.clId;
  }
}
