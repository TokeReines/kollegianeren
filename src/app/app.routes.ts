import {Routes} from '@angular/router';
import {authGuard, manageGuard} from './guards/auth.guard';
import {HomeComponent} from './components/home/home.component';
import {BuyPageComponent} from './components/buy-page/buy-page.component';

// The buy page is what tablets open all day, so it ships in the main bundle; everything else
// loads when first visited.
export const routes: Routes = [
  {path: 'login', loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent)},
  {path: 'register', loadComponent: () => import('./components/register/register.component').then(m => m.RegisterComponent)},
  {path: 'privacy', loadComponent: () => import('./components/privacy/privacy.component').then(m => m.PrivacyComponent)},
  {path: 'me/:token', loadComponent: () => import('./components/resident-view/resident-view.component').then(m => m.ResidentViewComponent)},
  {
    path: '', component: HomeComponent, canActivate: [authGuard], canActivateChild: [authGuard],
    children: [
      {path: '', component: BuyPageComponent},
      {path: 'products', canActivate: [manageGuard], loadComponent: () => import('./components/products/products.component').then(m => m.ProductsComponent)},
      {path: 'users', canActivate: [manageGuard], loadComponent: () => import('./components/users/users.component').then(m => m.UsersComponent)},
      {path: 'accounting', canActivate: [manageGuard], loadComponent: () => import('./components/accounting/accounting.component').then(m => m.AccountingComponent)},
      {path: 'access', canActivate: [manageGuard], loadComponent: () => import('./components/access/access.component').then(m => m.AccessComponent)},
      {path: 'stats', loadComponent: () => import('./components/stats/stats.component').then(m => m.StatsComponent)},
      {path: 'aktuelt', loadComponent: () => import('./components/aktuelt/aktuelt.component').then(m => m.AktueltComponent)},
      {path: 'maker', redirectTo: 'aktuelt'},
      {path: 'inbox', loadComponent: () => import('./components/maker-inbox/maker-inbox.component').then(m => m.MakerInboxComponent)},
    ],
  },
  {path: '**', redirectTo: ''},
];
