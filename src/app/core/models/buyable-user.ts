import {User} from '../interfaces/user';

export class BuyableUser implements User {
  selected: boolean;
  active: boolean;
  id: string;
  image: string;
  kitchen: string;
  name: string;
  room: string;
  clId: string;

  constructor(user: User) {
    this.selected = false;
    this.active = user.active;
    this.id = user.id;
    this.image = user.image;
    this.kitchen = user.kitchen;
    this.name = user.name;
    this.room = user.room;
    this.clId = user.clId;
  }

}
