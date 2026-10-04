import {CollectionReference, Query, collection} from 'firebase/firestore';
import {Observable, catchError, of, switchMap} from 'rxjs';
import {db, watch} from '../firebase';
import {Membership} from './auth.service';

export type KitchenCollection = 'products' | 'users' | 'purchases' | 'removed' | 'messages' | 'members' | 'meals' | 'summaries' | 'usage';

export function kitchenCollection(kitchenId: string, name: KitchenCollection): CollectionReference {
  return collection(db, 'kitchens', kitchenId, name);
}

// A live query inside the signed-in kitchen, re-run if the login switches kitchen.
export function watchInKitchen<T>(kitchenId$: Observable<string>, build: (kitchenId: string) => Query): Observable<T[]> {
  return kitchenId$.pipe(switchMap(kid => watch<T>(build(kid))));
}

// For listeners that app-wide services keep open (notifications, Kollegiet, battles): opened again
// at every sign-in and closed at sign-out. Given AuthService.viewer$ (a kitchen or the maker) or kitchen$ (the kitchen's own), so other logins open none. A listener the server refuses, as one does while a login
// signs out, gives `fallback` instead of an error, which would otherwise stick to the service and
// break every page that reads it until a reload.
export function whileSignedIn<T>(membership$: Observable<Membership | null>, build: (kitchenId: string) => Observable<T>,
                                 fallback: T): Observable<T> {
  return membership$.pipe(switchMap(m => m ? build(m.kitchenId).pipe(catchError(() => of(fallback))) : of(fallback)));
}
