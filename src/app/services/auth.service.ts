import {Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {AngularFireAuth} from '@angular/fire/auth';
import * as firebase from 'firebase';
import {switchMap} from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  user: Observable<firebase.User>;


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
    return this.afAuth.auth.signOut();
  }
}
