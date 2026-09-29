import {Component, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {Subscription} from 'rxjs';
import {UserService} from '../../services/user.service';
import {User} from '../../interfaces/user';
import {MatDialog} from '@angular/material/dialog';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatSort} from '@angular/material/sort';
import {MatTableDataSource} from '@angular/material/table';
import {EditUserDialogComponent} from './edit-user-dialog/edit-user-dialog.component';
import {AddUserDialogComponent} from './add-user-dialog/add-user-dialog.component';
import {RETENTION_MONTHS, ResidencyService} from '../../services/residency.service';
import {TranslateService} from '../../services/translate.service';
import {ResidentLinkService, residentLink} from '../../services/resident-link.service';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class UsersComponent implements OnInit, OnDestroy {
  users = new MatTableDataSource<User>([]);
  movedOut: User[] = [];
  dueForAnonymising: User[] = [];
  retentionMonths = RETENTION_MONTHS;
  busy = false;
  @ViewChild(MatSort, {static: true}) sort: MatSort;
  displayedColumns = ['image', 'name', 'room', 'active', 'link', 'edit', 'moveOut', 'delete'];
  private sub: Subscription;

  constructor(
    public userService: UserService,
    private residency: ResidencyService,
    private translate: TranslateService,
    private snackBar: MatSnackBar,
    private links: ResidentLinkService,
    public dialog: MatDialog,
  ) {
  }

  ngOnInit() {
    this.users.sort = this.sort;
    this.sub = this.userService.list().subscribe(all => {
      this.users.data = all.filter(u => !u.movedOutAt);
      this.movedOut = all.filter(u => !!u.movedOutAt)
        .sort((a, b) => (b.movedOutAt?.toMillis?.() || 0) - (a.movedOutAt?.toMillis?.() || 0));
      this.dueForAnonymising = this.movedOut.filter(u => this.residency.isDueForAnonymising(u));
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  private t(key: string) {
    return this.translate.data[key] || key;
  }

  private fail = (e: Error) => this.snackBar.open(e.message, 'OK', {duration: 6000});

  openEditDialog(user: User) {
    this.dialog.open(EditUserDialogComponent, {width: '400px', data: {...user}}).afterClosed().subscribe(edited => {
      if (edited) {
        this.userService.update(edited).catch(this.fail);
      }
    });
  }

  openAddDialog() {
    this.dialog.open(AddUserDialogComponent, {width: '400px', data: {}}).afterClosed().subscribe(newUser => {
      if (newUser) {
        this.userService.add(newUser).catch(this.fail);
      }
    });
  }

  remove(user: User) {
    if (confirm(`${this.t('RESIDENTS_DELETE_CONFIRM')} ${user.name}?`)) {
      this.userService.delete(user).catch(this.fail);
    }
  }

  async moveOut(user: User) {
    this.busy = true;
    try {
      const s = await this.residency.summary(user);
      const text = `${user.name}: ${this.t('RESIDENTS_MOVE_OUT_SUMMARY')} ${s.thisMonth.toFixed(2)} kr. / ${s.last12Months.toFixed(2)} kr.\n\n${this.t('RESIDENTS_MOVE_OUT_CONFIRM')}`;
      if (confirm(text)) {
        await this.residency.moveOut(user);
      }
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }

  async shareLink(user: User, renew = false) {
    try {
      const token = renew ? await this.links.renew(user) : await this.links.linkFor(user);
      const url = residentLink(token);
      try {
        await navigator.clipboard.writeText(url);
        this.snackBar.open(`${this.t('RESIDENTS_LINK_COPIED')} ${user.name}`, this.t('RESIDENTS_LINK_RENEW'), {duration: 8000})
          .onAction().subscribe(() => this.shareLink(user, true));
      } catch {
        this.snackBar.open(url, 'OK', {duration: 20000});
      }
    } catch (e) {
      this.fail(e);
    }
  }

  moveIn(user: User) {
    this.residency.moveIn(user).catch(this.fail);
  }

  async anonymise(users: User[]) {
    if (!confirm(`${this.t('RESIDENTS_ANONYMISE_CONFIRM')} (${users.length})`)) {
      return;
    }
    this.busy = true;
    try {
      let purchases = 0;
      for (const u of users) {
        purchases += await this.residency.anonymise(u);
      }
      this.snackBar.open(`${this.t('RESIDENTS_ANONYMISED')} ${users.length} / ${purchases}`, undefined, {duration: 5000});
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }
}
