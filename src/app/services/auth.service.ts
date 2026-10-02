import {Injectable, computed} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {Observable, catchError, combineLatest, filter, from, map, of, shareReplay, distinctUntilChanged, switchMap} from 'rxjs';
import {
  EmailAuthProvider, User, createUserWithEmailAndPassword, onAuthStateChanged, reauthenticateWithCredential,
  sendPasswordResetEmail, signInWithEmailAndPassword, signOut, verifyBeforeUpdateEmail,
} from 'firebase/auth';
import {doc} from 'firebase/firestore';
import {getDoc, onSnapshot} from '../read-meter';
import {auth, db, watchDoc} from '../firebase';

export type Role = 'owner' | 'treasurer' | 'tablet';

export interface Membership {
  uid: string;
  kitchenId: string;
  role: Role;
}

const CACHE_KEY = 'kollegianeren.membership';

@Injectable({providedIn: 'root'})
export class AuthService {
  // Emits the signed-in user, or null, once Firebase has restored the session.
  readonly user$: Observable<User | null> = new Observable<User | null>(subscriber => onAuthStateChanged(auth, subscriber))
    .pipe(shareReplay({bufferSize: 1, refCount: false}));

  // Which kitchen the login belongs to, and as what. Logins that joined with an invite have a
  // memberships/{uid} document; the original login of every kitchen has none and owns the kitchen
  // whose id is its uid. Cached on the device so a tablet restarted offline still finds its kitchen.
  readonly membership$: Observable<Membership | null> = this.user$.pipe(
    switchMap(user => user ? watchMembership(user.uid) : of(null)),
    distinctUntilChanged((a, b) => a?.uid === b?.uid && a?.kitchenId === b?.kitchenId && a?.role === b?.role),
    shareReplay({bufferSize: 1, refCount: false}),
  );
  // The signed-in kitchen's id. Waits for sign-in, because auth state arrives asynchronously.
  readonly kitchenId$: Observable<string> = this.membership$.pipe(
    filter((m): m is Membership => !!m), map(m => m.kitchenId), distinctUntilChanged(), shareReplay(1));
  // The membership once the login's kitchen exists, null for a login that has none (the maker's
  // own): Kollegiet, notifications and the other kitchen listeners only start for a kitchen. The
  // kitchen document is already watched for its name, so this costs no extra read.
  readonly kitchen$: Observable<Membership | null> = this.membership$.pipe(
    switchMap(m => m ? watchDoc(doc(db, 'kitchens', m.kitchenId)).pipe(map(k => k ? m : null), catchError(() => of(m))) : of(null)),
    distinctUntilChanged(),
    shareReplay({bufferSize: 1, refCount: false}),
  );
  readonly hasKitchen = toSignal(this.kitchen$.pipe(map(m => !!m)), {initialValue: false});
  // The maker: users with an admins/{uid} document, which only the Firebase console can create.
  readonly isAdmin$: Observable<boolean> = this.user$.pipe(
    switchMap(user => user ? from(getDoc(doc(db, 'admins', user.uid)).then(d => d.exists(), () => false)) : of(false)),
    shareReplay(1),
  );
  // Who may look at Kollegiet and Aktuelt: a kitchen, or the maker (who has none). For the shared
  // listeners; the kitchen's own ones (seen, standing) use kitchen$.
  readonly viewer$: Observable<Membership | null> = combineLatest([this.membership$, this.kitchen$, this.isAdmin$]).pipe(
    map(([m, kitchen, admin]) => kitchen ?? (admin ? m : null)),
    distinctUntilChanged(),
    shareReplay({bufferSize: 1, refCount: false}),
  );
  readonly role$: Observable<Role> = this.membership$.pipe(
    filter((m): m is Membership => !!m), map(m => m.role), distinctUntilChanged(), shareReplay(1));

  readonly user = toSignal(this.user$, {initialValue: null});
  readonly membership = toSignal(this.membership$, {initialValue: null});
  readonly role = computed(() => this.membership()?.role ?? null);
  // Owners and treasurers manage products, residents, accounts and logins; tablets only buy.
  readonly canManage = computed(() => !!this.role() && this.role() !== 'tablet');

  // The signed-in kitchen's id right now, for writes triggered by the user.
  get currentKitchenId(): string {
    const m = this.membership();
    if (!m) {
      throw new Error('Not signed in');
    }
    return m.kitchenId;
  }

  emailSignup(email: string, password: string) {
    return createUserWithEmailAndPassword(auth, email, password);
  }

  emailLogin(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  sendResetEmail(email: string) {
    return sendPasswordResetEmail(auth, email);
  }

  // Hands the login over to someone else, e.g. when the owner moves out: Firebase mails a link
  // to the new address and switches the login's email once it is opened. Kitchen, role and data
  // stay; the successor sets a new password with "forgot password". Needs the current password.
  async handOver(password: string, newEmail: string) {
    const user = auth.currentUser;
    if (!user?.email) {
      throw new Error('Not signed in');
    }
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    await verifyBeforeUpdateEmail(user, newEmail);
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

function watchMembership(uid: string): Observable<Membership> {
  return new Observable<Membership>(subscriber => {
    const cached = readCache(uid);
    if (cached) {
      subscriber.next(cached);
    }
    return onSnapshot(doc(db, 'memberships', uid), {includeMetadataChanges: true}, snap => {
      // "No membership" from the offline cache is not an answer: wait for the server.
      if (!snap.exists() && snap.metadata.fromCache) {
        return;
      }
      const m: Membership = snap.exists()
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
