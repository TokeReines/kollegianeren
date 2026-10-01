import {Component, inject} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {User} from 'firebase/auth';
import {filter, take} from 'rxjs';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {AppUpdateService} from '../../services/app-update.service';
import {AuthService} from '../../services/auth.service';
import {TranslatePipe} from '../../translate.pipe';
import {MessageBannerComponent} from '../shared/message-banner.component';
import {NavigationComponent} from '../navigation/navigation.component';
import {ToolbarComponent} from '../toolbar/toolbar.component';
import {openReveal, revealWanted} from '../reveal-dialog/reveal-dialog.component';

// The signed-in shell: offline banner, top app bar, a new message from Toke, navigation and the page.
@Component({
  selector: 'app-home',
  imports: [MatIconModule, TranslatePipe, MessageBannerComponent, NavigationComponent, ToolbarComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  private readonly appUpdate = inject(AppUpdateService);
  protected readonly online = this.appUpdate.online;

  constructor() {
    this.appUpdate.start();
    const dialog = inject(MatDialog);
    inject(AuthService).user$.pipe(filter((u): u is User => !!u && !u.isAnonymous), take(1), takeUntilDestroyed()).subscribe(user => {
      if (revealWanted(user.uid)) {
        openReveal(dialog, {uid: user.uid});
      }
    });
  }
}
