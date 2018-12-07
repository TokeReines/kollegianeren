import {NgModule} from '@angular/core';
import {Routes, RouterModule} from '@angular/router';

import {ProductsComponent} from './products/products.component';
import {UsersComponent} from './users/users.component';
import {LoginComponent} from './login/login.component';
import {RegisterComponent} from './register/register.component';
import {AuthGuard} from './core/services/auth-guard.service';
import {BuyPageComponent} from './buy-page/buy-page.component';
import {AccountingComponent} from './accounting/accounting.component';
import {HomeComponent} from './home/home.component';

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
