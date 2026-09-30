import {CollectionReference, Query, collection} from 'firebase/firestore';
import {Observable, switchMap} from 'rxjs';
import {db, watch} from '../firebase';

export type KitchenCollection = 'products' | 'users' | 'purchases' | 'messages' | 'members' | 'meals';

export function kitchenCollection(kitchenId: string, name: KitchenCollection): CollectionReference {
  return collection(db, 'kitchens', kitchenId, name);
}

// A live query inside the signed-in kitchen, re-run if the login switches kitchen.
export function watchInKitchen<T>(kitchenId$: Observable<string>, build: (kitchenId: string) => Query): Observable<T[]> {
  return kitchenId$.pipe(switchMap(kid => watch<T>(build(kid))));
}

