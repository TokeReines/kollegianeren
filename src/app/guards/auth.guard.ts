import {Injectable} from '@angular/core';
import {AuthService} from '../services/auth.service';
import { Router } from '@angular/router';
import {take, tap, map} from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard  {

  constructor(private router: Router, private authService: AuthService) {
  }

  canActivate() {
    return this.authService.user.pipe(
      take(1),
      map(user => !!user && !user.isAnonymous),
      tap(loggedIn => {
        if (!loggedIn) {
          console.log('access denied');
          this.router.navigate(['login']);
        }
      })
    );
  }
}
