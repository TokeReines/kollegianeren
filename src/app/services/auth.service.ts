import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {filter, map, shareReplay} from 'rxjs/operators';
import {
  User, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import {auth} from '../firebase';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Emits the signed-in user, or null, once Firebase has restored the session.
  user: Observable<User | null> = new Observable<User | null>(subscriber => onAuthStateChanged(auth, subscriber))
    .pipe(shareReplay({bufferSize: 1, refCount: false}));
  // The signed-in kitchen's uid. Waits for sign-in, because auth state arrives asynchronously.
  kitchenId: Observable<string> = this.user.pipe(filter(user => !!user), map(user => user.uid), shareReplay(1));

  // The signed-in kitchen's uid right now, for writes triggered by the user.
  get currentKitchenId(): string {
    if (!auth.currentUser) {
      throw new Error('Not signed in');
    }
    return auth.currentUser.uid;
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
    return signOut(auth);
  }
}
