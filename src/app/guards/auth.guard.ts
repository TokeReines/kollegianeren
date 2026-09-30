import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {map, take} from 'rxjs';
import {AuthService} from '../services/auth.service';
import {MakerService} from '../services/maker.service';

// Signed in with a kitchen login (the anonymous sessions of resident links do not count).
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).user$.pipe(
    take(1),
    map(user => user && !user.isAnonymous ? true : router.createUrlTree(['/login'])),
  );
};

// Management pages; a tablet login is sent to the buy page. The rules enforce it regardless.
export const manageGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).role$.pipe(
    take(1),
    map(role => role !== 'tablet' ? true : router.createUrlTree(['/'])),
  );
};

// The maker's admin page. The rules keep its data to admins regardless.
export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(MakerService).isAdmin$.pipe(
    take(1),
    map(admin => admin ? true : router.createUrlTree(['/'])),
  );
};
