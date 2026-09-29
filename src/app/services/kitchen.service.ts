import {Injectable} from '@angular/core';
import {collection, doc, onSnapshot, setDoc} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {Kitchen} from '../interfaces/kitchen';
import {db, watch} from '../firebase';

@Injectable({
  providedIn: 'root'
})
export class KitchenService {

  set(kitchen: Kitchen) {
    return setDoc(doc(db, 'kitchens', kitchen.id), kitchen);
  }

  // One kitchen's name, live (renames show up straight away).
  name(kitchenId: string): Observable<string> {
    return new Observable<string>(subscriber => onSnapshot(
      doc(db, 'kitchens', kitchenId),
      snap => subscriber.next(snap.get('name') || ''),
      () => subscriber.next(''),
    ));
  }

  // All registered kitchens (id and name). Readable before sign-in, for the register page.
  list() {
    return watch<Kitchen>(collection(db, 'kitchens'));
  }
}
