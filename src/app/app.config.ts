import {registerLocaleData} from '@angular/common';
import localeDa from '@angular/common/locales/da';
import {
  ApplicationConfig, LOCALE_ID, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection,
} from '@angular/core';
import {MAT_CARD_CONFIG} from '@angular/material/card';
import {MAT_DATE_LOCALE, provideNativeDateAdapter} from '@angular/material/core';
import {MAT_FORM_FIELD_DEFAULT_OPTIONS} from '@angular/material/form-field';
import {provideRouter, withComponentInputBinding} from '@angular/router';
import {provideServiceWorker} from '@angular/service-worker';
import {environment} from '../environments/environment';
import {routes} from './app.routes';
import {TranslateService} from './services/translate.service';

// Dates read the Danish way (29. september 2026) in both languages; the kitchens are Danish.
registerLocaleData(localeDa);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    // Built only for -c dev and -c production (angular.json); the emulator dev server has none.
    provideServiceWorker('ngsw-worker.js', {enabled: !environment.emulators, registrationStrategy: 'registerWhenStable:30000'}),
    provideNativeDateAdapter(),
    provideAppInitializer(() => inject(TranslateService).init()),
    {provide: LOCALE_ID, useValue: 'da'},
    {provide: MAT_DATE_LOCALE, useValue: 'da-DK'},
    {provide: MAT_CARD_CONFIG, useValue: {appearance: 'outlined'}},
    {provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: {appearance: 'outline', subscriptSizing: 'dynamic'}},
  ],
};
