import { BrowserModule } from '@angular/platform-browser';
import { LOCALE_ID, NgModule, inject, provideAppInitializer } from '@angular/core';
import { ServiceWorkerModule } from '@angular/service-worker';
import { registerLocaleData } from '@angular/common';
import localeDa from '@angular/common/locales/da';
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
import { environment } from '../environments/environment';
import { AuthService } from './services/auth.service';
import { AuthGuard } from './guards/auth.guard';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { EditProductDialogComponent } from './components/products/edit-product-dialog/edit-product-dialog.component';
import { AddProductDialogComponent } from './components/products/add-product-dialog/add-product-dialog.component';
import { AddUserDialogComponent } from './components/users/add-user-dialog/add-user-dialog.component';
import { EditUserDialogComponent } from './components/users/edit-user-dialog/edit-user-dialog.component';
import { SidenavService } from './services/sidenav.service';
import { BuyPageComponent } from './components/buy-page/buy-page.component';
import { HistoryBottomSheetComponent } from './components/buy-page/history-bottom-sheet/history-bottom-sheet.component';
import { AccountingComponent } from './components/accounting/accounting.component';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import { PriceInputDirective } from './directives/priceInput.directive';
import { TranslateService } from './services/translate.service';
import { TranslatePipe } from './translate.pipe';
import { ClUrlPipe } from './cl-url.pipe';
import { AktueltComponent } from './components/aktuelt/aktuelt.component';
import { MakerChatComponent } from './components/maker-chat/maker-chat.component';
import { MakerInboxComponent } from './components/maker-inbox/maker-inbox.component';
import { RevealDialogComponent } from './components/reveal-dialog/reveal-dialog.component';
import { AccessComponent } from './components/access/access.component';
import { PrivacyComponent } from './components/privacy/privacy.component';
import { StatsComponent } from './components/stats/stats.component';
import { ResidentViewComponent } from './components/resident-view/resident-view.component';

// Dates read the Danish way (29. september 2026) in both languages; the kitchens are Danish.
registerLocaleData(localeDa);

export function setupTranslateFactory(
  service: TranslateService): Function {
  return () => service.use('da');
}

@NgModule({ declarations: [
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
        TranslatePipe,
        ClUrlPipe,
        AktueltComponent,
        MakerChatComponent,
        MakerInboxComponent,
        RevealDialogComponent,
        AccessComponent,
        PrivacyComponent,
        StatsComponent,
        ResidentViewComponent
    ],
    bootstrap: [AppComponent], imports: [BrowserModule,
        // Built only for -c dev and -c production (angular.json); the emulator dev server has none.
        ServiceWorkerModule.register('ngsw-worker.js', { enabled: !environment.emulators, registrationStrategy: 'registerWhenStable:30000' }),
        AppRoutingModule,
        BrowserAnimationsModule,
        MaterialModule,
        MatTableModule,
        FormsModule,
        ReactiveFormsModule], providers: [
        { provide: MAT_DATE_LOCALE, useValue: 'da-DK' },
        { provide: LOCALE_ID, useValue: 'da' }, AuthService, AuthGuard, SidenavService, TranslateService, provideAppInitializer(() => {
        const initializerFn = (setupTranslateFactory)(inject(TranslateService));
        return initializerFn();
      }),
        provideHttpClient(withXhr(), withInterceptorsFromDi())
    ] })
export class AppModule { }
