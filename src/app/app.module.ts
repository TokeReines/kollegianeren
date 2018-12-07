import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';
import {MaterialModule} from './core/material.module';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {HomeComponent} from './home/home.component';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {NavigationComponent} from './navigation/navigation.component';
import {UsersComponent} from './users/users.component';
import {ProductsComponent} from './products/products.component';
import {LoginComponent} from './login/login.component';
import {ToolbarComponent} from './toolbar/toolbar.component';
import {RegisterComponent} from './register/register.component';
import {AngularFireModule} from '@angular/fire';
import {environment} from '../environments/environment';
import {AngularFireAuthModule} from '@angular/fire/auth';
import {AngularFireDatabaseModule} from '@angular/fire/database';
import {AuthService} from './core/services/auth.service';
import {AuthGuard} from './core/services/auth-guard.service';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {ErrorComponent} from './error/error.component';
import {AngularFirestoreModule} from '@angular/fire/firestore';
import {MAT_DATE_LOCALE, MatTableModule} from '@angular/material';
import {EditProductDialogComponent} from './products/edit-product-dialog/edit-product-dialog.component';
import {AddProductDialogComponent} from './products/add-product-dialog/add-product-dialog.component';
import {AddUserDialogComponent} from './users/add-user-dialog/add-user-dialog.component';
import {EditUserDialogComponent} from './users/edit-user-dialog/edit-user-dialog.component';
import {SidenavService} from './core/services/sidenav.service';
import {BuyPageComponent} from './buy-page/buy-page.component';
import {FlexLayoutModule} from '@angular/flex-layout';
import {HistoryBottomSheetComponent} from './buy-page/history-bottom-sheet/history-bottom-sheet.component';
import {AccountingComponent} from './accounting/accounting.component';
import {CloudinaryConfiguration, CloudinaryModule} from '@cloudinary/angular-5.x';
import {Cloudinary} from 'cloudinary-core';
import {HttpClientModule} from '@angular/common/http';

export const cloudinaryLib = {
  Cloudinary: Cloudinary
};

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    NavigationComponent,
    UsersComponent,
    ProductsComponent,
    LoginComponent,
    ToolbarComponent,
    RegisterComponent,
    ErrorComponent,
    EditProductDialogComponent,
    AddProductDialogComponent,
    AddUserDialogComponent,
    EditUserDialogComponent,
    BuyPageComponent,
    HistoryBottomSheetComponent,
    AccountingComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MaterialModule,
    MatTableModule,
    AngularFireModule.initializeApp(environment.firebase),
    CloudinaryModule.forRoot(cloudinaryLib, environment.cloudinary as CloudinaryConfiguration),
    AngularFireDatabaseModule,
    AngularFirestoreModule,
    AngularFireAuthModule,
    FormsModule,
    ReactiveFormsModule,
    FlexLayoutModule,
    HttpClientModule
  ],
  providers: [{provide: MAT_DATE_LOCALE, useValue: 'da-DK'}, AuthService, AuthGuard, SidenavService],
  bootstrap: [AppComponent],
  entryComponents: [EditProductDialogComponent, AddProductDialogComponent, EditUserDialogComponent, AddUserDialogComponent, HistoryBottomSheetComponent]
})
export class AppModule {
}
