import {NgModule} from '@angular/core';
import {Routes, RouterModule} from '@angular/router';

import {ProductsComponent} from './components/products/products.component';
import {UsersComponent} from './components/users/users.component';
import {LoginComponent} from './components/login/login.component';
import {RegisterComponent} from './components/register/register.component';
import {AuthGuard} from './guards/auth.guard';
import {BuyPageComponent} from './components/buy-page/buy-page.component';
import {AccountingComponent} from './components/accounting/accounting.component';
import {HomeComponent} from './components/home/home.component';

const routes: Routes = [
    {path: 'login', component: LoginComponent},
    {path: 'register', component: RegisterComponent},
    {
      path: '', canActivate: [AuthGuard], component: HomeComponent,
      children: [
        {path: '', component: BuyPageComponent, canActivate: [AuthGuard]},
        {path: 'products', component: ProductsComponent, canActivate: [AuthGuard]},
        {path: 'users', component: UsersComponent, canActivate: [AuthGuard]},
        {path: 'accounting', component: AccountingComponent, canActivate: [AuthGuard]}]
    }
  ]
;

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {
}
