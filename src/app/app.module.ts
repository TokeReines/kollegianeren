import { BrowserModule } from '@angular/platform-browser';
import { NgModule, APP_INITIALIZER } from '@angular/core';
import { MaterialModule } from './material.module';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LanguageButtonComponent } from './components/language-button/language-button.component';
import { HomeComponent } from './components/home/home.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NavigationComponent } from './components/navigation/navigation.component';
import { UsersComponent } from './components/users/users.component';
import { ProductsComponent } from './components/products/products.component';
import { LoginComponent } from './components/login/login.component';
import { ResetPasswordDialogComponent } from './components/login/reset-password-dialog/reset-password-dialog.component';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { RegisterComponent } from './components/register/register.component';
import { AngularFireModule } from '@angular/fire';
import { environment } from '../environments/environment';
import { AngularFireAuthModule } from '@angular/fire/auth';
import { AngularFireDatabaseModule } from '@angular/fire/database';
import { AuthService } from './services/auth.service';
import { AuthGuard } from './guards/auth.guard';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AngularFirestoreModule } from '@angular/fire/firestore';
import { MAT_DATE_LOCALE, MatTableModule } from '@angular/material';
import { EditProductDialogComponent } from './components/products/edit-product-dialog/edit-product-dialog.component';
import { AddProductDialogComponent } from './components/products/add-product-dialog/add-product-dialog.component';
import { AddUserDialogComponent } from './components/users/add-user-dialog/add-user-dialog.component';
import { EditUserDialogComponent } from './components/users/edit-user-dialog/edit-user-dialog.component';
import { SidenavService } from './services/sidenav.service';
import { BuyPageComponent } from './components/buy-page/buy-page.component';
import { FlexLayoutModule } from '@angular/flex-layout';
import { HistoryBottomSheetComponent } from './components/buy-page/history-bottom-sheet/history-bottom-sheet.component';
import { AccountingComponent } from './components/accounting/accounting.component';
import { CloudinaryConfiguration, CloudinaryModule } from '@cloudinary/angular-5.x';
import { Cloudinary } from 'cloudinary-core';
import { HttpClientModule } from '@angular/common/http';
import { PriceInputDirective } from './directives/priceInput.directive';
import { TranslateService } from './services/translate.service';
import { TranslatePipe } from './translate.pipe';

export const cloudinaryLib = {
  Cloudinary: Cloudinary
};

export function setupTranslateFactory(
  service: TranslateService): Function {
  return () => service.use('da');
}

@NgModule({
  declarations: [
    AppComponent,
    LanguageButtonComponent,
    HomeComponent,
    NavigationComponent,
    UsersComponent,
    ProductsComponent,
    LoginComponent,
    ResetPasswordDialogComponent,
    ToolbarComponent,
    RegisterComponent,
    EditProductDialogComponent,
    AddProductDialogComponent,
    AddUserDialogComponent,
    EditUserDialogComponent,
    BuyPageComponent,
    HistoryBottomSheetComponent,
    AccountingComponent,
    PriceInputDirective,
    TranslatePipe
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
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'da-DK' }, AuthService, AuthGuard, SidenavService, TranslateService, {
    provide: APP_INITIALIZER,
    useFactory: setupTranslateFactory,
    deps: [TranslateService],
    multi: true
  }],
  bootstrap: [AppComponent],
  entryComponents: [
    EditProductDialogComponent,
    AddProductDialogComponent,
    EditUserDialogComponent,
    AddUserDialogComponent,
    HistoryBottomSheetComponent,
    ResetPasswordDialogComponent
  ]
})
export class AppModule { }
