import {ChangeDetectionStrategy, Component} from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {Announcement, MakerService} from '../../services/maker.service';
import {MatDialog} from '@angular/material/dialog';
import {RevealDialogComponent} from '../reveal-dialog/reveal-dialog.component';

// "Aktuelt": what's new and what's planned, written by the maker. Admins can post here.
@Component({
  selector: 'app-aktuelt',
  templateUrl: './aktuelt.component.html',
  styleUrls: ['./aktuelt.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AktueltComponent {
  announcements: Observable<Announcement[]> = this.maker.announcements();
  isAdmin = this.maker.isAdmin;
  coffeeUrl = environment.maker.coffeeUrl;
  title = '';
  body = '';

  constructor(private maker: MakerService, private snackBar: MatSnackBar, private dialog: MatDialog) {
  }

  showReveal() {
    this.dialog.open(RevealDialogComponent, {maxWidth: '96vw', autoFocus: false});
  }

  post() {
    this.maker.postAnnouncement(this.title.trim(), this.body.trim())
      .then(() => {
        this.title = '';
        this.body = '';
      }, err => this.snackBar.open(err.message, 'OK', {duration: 6000}));
  }
}
