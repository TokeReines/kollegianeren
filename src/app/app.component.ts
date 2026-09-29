import {Component, inject} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {ThemeService} from './services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class AppComponent {
  // Applies the saved light/dark choice before the first page renders.
  private readonly theme = inject(ThemeService);
}
