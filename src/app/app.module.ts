import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MaterialModule } from './material.module';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { environment } from '../environments/environment';
import { provideAnalytics, getAnalytics, ScreenTrackingService, UserTrackingService } from '@angular/fire/analytics';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideDatabase, getDatabase } from '@angular/fire/database';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideFunctions, getFunctions } from '@angular/fire/functions';
import { provideMessaging, getMessaging } from '@angular/fire/messaging';
import { providePerformance, getPerformance } from '@angular/fire/performance';
import { provideRemoteConfig, getRemoteConfig } from '@angular/fire/remote-config';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { AccountingComponent } from './components/accounting/accounting.component';
import { BuyPageComponent } from './components/buy-page/buy-page.component';
import { HistoryBottomSheetComponent } from './components/buy-page/history-bottom-sheet/history-bottom-sheet.component';
import { HomeComponent } from './components/home/home.component';
import { LanguageButtonComponent } from './components/language-button/language-button.component';
import { LoginComponent } from './components/login/login.component';
import { ResetPasswordDialogComponent } from './components/login/reset-password-dialog/reset-password-dialog.component';
import { NavigationComponent } from './components/navigation/navigation.component';
import { AddProductDialogComponent } from './components/products/add-product-dialog/add-product-dialog.component';
import { EditProductDialogComponent } from './components/products/edit-product-dialog/edit-product-dialog.component';
import { ProductsComponent } from './components/products/products.component';
import { RegisterComponent } from './components/register/register.component';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { PriceInputDirective } from './directives/priceInput.directive';
import { TranslateService } from './services/translate.service';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { AuthGuard } from './guards/auth.guard';
import { AuthService } from './services/auth.service';
import { SidenavService } from './services/sidenav.service';
import { AngularFireModule } from '@angular/fire/compat';
import { HttpClientModule } from '@angular/common/http';
import { TranslatePipe } from './translate-pipe.pipe';
import {CloudinaryModule} from '@cloudinary/ng';

export function setupTranslateFactory(service: TranslateService): Function {
  return () => service.use('da');
}

@NgModule({
  declarations: [
    AppComponent,
    LanguageButtonComponent,
    HomeComponent,
    NavigationComponent,
    // UsersComponent,
    ProductsComponent,
    LoginComponent,
    ResetPasswordDialogComponent,
    ToolbarComponent,
    RegisterComponent,
    EditProductDialogComponent,
    AddProductDialogComponent,
    // AddUserDialogComponent,
    // EditUserDialogComponent,
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
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => getFirestore()),
    
    AngularFireModule.initializeApp(environment.firebase),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    FormsModule,
    ReactiveFormsModule,
    CloudinaryModule,
    HttpClientModule,
  ],
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'da-DK' },
    AuthService,
    AuthGuard,
    SidenavService,
    ScreenTrackingService,
    UserTrackingService,
    TranslateService,
    {
      provide: APP_INITIALIZER,
      useFactory: setupTranslateFactory,
      deps: [TranslateService],
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
