import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AppUpdateService } from '../../services/app-update.service';
import { RevealDialogComponent, revealSeen } from '../reveal-dialog/reveal-dialog.component';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HomeComponent implements OnInit {

  online = this.appUpdate.online;

  constructor(private dialog: MatDialog, private appUpdate: AppUpdateService) { }

  ngOnInit() {
    this.appUpdate.start();
    if (!revealSeen()) {
      this.dialog.open(RevealDialogComponent, {maxWidth: '96vw', autoFocus: false});
    }
  }

}
