import {Component, inject} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {ThemeService} from './services/theme.service';
import {AppUpdateService} from './services/app-update.service';
import {NavHistory} from './services/nav-history.service';
import {UsageService} from './services/usage.service';
import {NetworkService} from './services/network.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class AppComponent {
  // Applies the saved light/dark choice before the first page renders.
  private readonly theme = inject(ThemeService);

  constructor() {
    // New versions install themselves on every page, the login page too.
    inject(AppUpdateService).start();
    inject(UsageService).start();
    inject(NetworkService).start();
    inject(NavHistory);
  }
}
