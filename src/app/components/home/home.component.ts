import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { RevealDialogComponent, revealSeen } from '../reveal-dialog/reveal-dialog.component';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HomeComponent implements OnInit {

  constructor(private dialog: MatDialog) { }

  ngOnInit() {
    if (!revealSeen()) {
      this.dialog.open(RevealDialogComponent, {maxWidth: '96vw', autoFocus: false});
    }
  }

}
