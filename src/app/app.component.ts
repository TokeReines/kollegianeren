import {Component, inject} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {ThemeService} from './services/theme.service';
import {AppUpdateService} from './services/app-update.service';

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
  }
}
