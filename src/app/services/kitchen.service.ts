import {Injectable} from '@angular/core';
import {collection, doc} from 'firebase/firestore';
import {Observable, map} from 'rxjs';
import {Kitchen} from '../interfaces/kitchen';
import {db, watch, watchDoc} from '../firebase';

@Injectable({providedIn: 'root'})
export class KitchenService {
  // One kitchen's name, live (renames show up straight away). One read, not the whole list.
  name(kitchenId: string): Observable<string> {
    return watchDoc<Kitchen>(doc(db, 'kitchens', kitchenId)).pipe(map(k => k?.name ?? ''));
  }

  // All registered kitchens (id and name). Readable before sign-in, for the register page.
  list(): Observable<Kitchen[]> {
    return watch<Kitchen>(collection(db, 'kitchens'));
  }
}
