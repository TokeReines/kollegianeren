import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AppUpdateService } from '../../services/app-update.service';
import { RevealDialogComponent, revealWanted } from '../reveal-dialog/reveal-dialog.component';
import { AuthService } from '../../services/auth.service';
import { filter, take } from 'rxjs/operators';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HomeComponent implements OnInit {

  online = this.appUpdate.online;

  constructor(private dialog: MatDialog, private appUpdate: AppUpdateService, private auth: AuthService) { }

  ngOnInit() {
    this.appUpdate.start();
    this.auth.user.pipe(filter(u => !!u && !u.isAnonymous), take(1)).subscribe(user => {
      if (revealWanted(user.uid)) {
        this.dialog.open(RevealDialogComponent, {maxWidth: '96vw', autoFocus: false, data: {uid: user.uid}});
      }
    });
  }

}
