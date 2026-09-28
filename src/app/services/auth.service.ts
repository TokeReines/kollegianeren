import {Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {AngularFireAuth} from '@angular/fire/compat/auth';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import {filter, map, shareReplay, switchMap} from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  user: Observable<firebase.User>;
  // The signed-in kitchen's uid. Waits for sign-in, because auth state arrives asynchronously.
  kitchenId: Observable<string>;


  constructor(private afAuth: AngularFireAuth) {
    this.user = this.afAuth.authState.pipe(
      switchMap(user => {
        if (user) {
          return of(user);
        } else {
          return of(null);
        }
      })
    );
    this.kitchenId = this.user.pipe(filter(user => !!user), map(user => user.uid), shareReplay(1));
  }

  emailSignup(email, password) {
    return new Promise<any>((resolve, reject) => {
      firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(res => {
          resolve(res);
        }, err => reject(err));
    });
  }

  emailLogin(email, password) {
    return new Promise<any>((resolve, reject) => {
      firebase.auth().signInWithEmailAndPassword(email, password)
        .then(res => {
          resolve(res);
        }, err => reject(err));
    });
  }

  sendResetEmail(email) {
    console.log(email);
    return new Promise<any>((resolve, reject) => {
      firebase.auth().sendPasswordResetEmail(email)
        .then(res => {
          resolve(res);
        }, err => reject(err));
    });
  }

  isLoggedIn() {
    return this.afAuth.authState;
  }

  logout() {
    return this.afAuth.signOut();
  }
}
