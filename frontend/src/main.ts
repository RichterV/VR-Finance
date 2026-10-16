import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID, inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { NoPreloading, RouteReuseStrategy, provideRouter, withComponentInputBinding, withPreloading } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { apiBaseInterceptor, initServerSelection } from './app/core/api-base';
import { AppLockService } from './app/core/app-lock.service';
import { authInterceptor } from './app/core/auth.interceptor';

registerLocaleData(localePt);

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    provideIonicAngular(),
    // Sem pré-carregar todas as páginas logo depois de abrir o app (economiza dados no 4G): cada uma
    // baixa quando é aberta.
    provideRouter(routes, withPreloading(NoPreloading), withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, apiBaseInterceptor])),
    provideAppInitializer(initServerSelection),
    provideAppInitializer(() => inject(AppLockService).init()),
  ],
});
