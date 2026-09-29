import {Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {distinctUntilChanged, filter, map, shareReplay, switchMap} from 'rxjs/operators';
import {
  User, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import {doc, onSnapshot} from 'firebase/firestore';
import {auth, db} from '../firebase';

export type Role = 'owner' | 'treasurer' | 'tablet';

export interface Membership {
  uid: string;
  kitchenId: string;
  role: Role;
}

const CACHE_KEY = 'kollegianeren.membership';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Emits the signed-in user, or null, once Firebase has restored the session.
  user: Observable<User | null> = new Observable<User | null>(subscriber => onAuthStateChanged(auth, subscriber))
    .pipe(shareReplay({bufferSize: 1, refCount: false}));

  // Which kitchen the login belongs to, and as what. Logins that joined with an invite have a
  // memberships/{uid} document; the original login of every kitchen has none and owns the kitchen
  // whose id is its uid. Cached on the device so a tablet restarted offline still finds its kitchen.
  membership: Observable<Membership | null> = this.user.pipe(
    switchMap(user => user ? this.watchMembership(user.uid) : of(null)),
    distinctUntilChanged((a, b) => a?.uid === b?.uid && a?.kitchenId === b?.kitchenId && a?.role === b?.role),
    shareReplay(1),
  );
  // The signed-in kitchen's id. Waits for sign-in, because auth state arrives asynchronously.
  kitchenId: Observable<string> = this.membership.pipe(filter(m => !!m), map(m => m.kitchenId), distinctUntilChanged(), shareReplay(1));
  role: Observable<Role> = this.membership.pipe(filter(m => !!m), map(m => m.role), distinctUntilChanged(), shareReplay(1));
  private current: Membership | null = null;

  constructor() {
    this.membership.subscribe(m => this.current = m);
  }

  // The signed-in kitchen's id right now, for writes triggered by the user.
  get currentKitchenId(): string {
    if (!this.current) {
      throw new Error('Not signed in');
    }
    return this.current.kitchenId;
  }

  private watchMembership(uid: string): Observable<Membership> {
    return new Observable<Membership>(subscriber => {
      const cached = readCache(uid);
      if (cached) {
        subscriber.next(cached);
      }
      return onSnapshot(doc(db, 'memberships', uid), {includeMetadataChanges: true}, snap => {
        const fromCache = snap.metadata.fromCache;
        const exists = snap.exists();
        // "No membership" from the offline cache is not an answer: wait for the server.
        if (!exists && fromCache) {
          return;
        }
        const m: Membership = exists
          ? {uid, kitchenId: snap.get('kitchenId'), role: snap.get('role')}
          : {uid, kitchenId: uid, role: 'owner'};
        writeCache(m);
        subscriber.next(m);
      }, () => {
        if (!cached) {
          subscriber.next({uid, kitchenId: uid, role: 'owner'});
        }
      });
    });
  }

  emailSignup(email, password) {
    return createUserWithEmailAndPassword(auth, email, password);
  }

  emailLogin(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  sendResetEmail(email) {
    return sendPasswordResetEmail(auth, email);
  }

  isLoggedIn() {
    return this.user;
  }

  logout() {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // Storage unavailable: nothing cached to clear.
    }
    return signOut(auth);
  }
}

function readCache(uid: string): Membership | null {
  try {
    const m = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return m && m.uid === uid ? m : null;
  } catch {
    return null;
  }
}

function writeCache(m: Membership) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(m));
  } catch {
    // Storage unavailable: the membership is looked up again next time.
  }
}
