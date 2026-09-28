import {Injectable} from '@angular/core';
import {collection, doc, setDoc} from 'firebase/firestore';
import {Kitchen} from '../interfaces/kitchen';
import {db, watch} from '../firebase';

@Injectable({
  providedIn: 'root'
})
export class KitchenService {

  set(kitchen: Kitchen) {
    return setDoc(doc(db, 'kitchens', kitchen.id), kitchen);
  }

  // All registered kitchens (id and name). Readable before sign-in, for the register page.
  list() {
    return watch<Kitchen>(collection(db, 'kitchens'));
  }
}
