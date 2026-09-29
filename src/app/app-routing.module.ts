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
import {AktueltComponent} from './components/aktuelt/aktuelt.component';
import {MakerChatComponent} from './components/maker-chat/maker-chat.component';
import {MakerInboxComponent} from './components/maker-inbox/maker-inbox.component';
import {AccessComponent} from './components/access/access.component';
import {PrivacyComponent} from './components/privacy/privacy.component';
import {StatsComponent} from './components/stats/stats.component';

const routes: Routes = [
    {path: 'login', component: LoginComponent},
    {path: 'register', component: RegisterComponent},
    {path: 'privacy', component: PrivacyComponent},
    {
      path: '', canActivate: [AuthGuard], component: HomeComponent,
      children: [
        {path: '', component: BuyPageComponent, canActivate: [AuthGuard]},
        {path: 'products', component: ProductsComponent, canActivate: [AuthGuard]},
        {path: 'users', component: UsersComponent, canActivate: [AuthGuard]},
        {path: 'accounting', component: AccountingComponent, canActivate: [AuthGuard]},
        {path: 'aktuelt', component: AktueltComponent, canActivate: [AuthGuard]},
        {path: 'maker', component: MakerChatComponent, canActivate: [AuthGuard]},
        {path: 'inbox', component: MakerInboxComponent, canActivate: [AuthGuard]},
        {path: 'access', component: AccessComponent, canActivate: [AuthGuard]},
        {path: 'stats', component: StatsComponent, canActivate: [AuthGuard]}]
    }
  ]
;

@NgModule({
  imports: [RouterModule.forRoot(routes, {})],
  exports: [RouterModule]
})
export class AppRoutingModule {
}
