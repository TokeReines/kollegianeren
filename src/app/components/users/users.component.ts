import {Component, computed, effect, inject, signal, viewChild} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatTooltipModule} from '@angular/material/tooltip';
import {User, UserFields} from '../../interfaces/user';
import {millis} from '../../time';
import {kr} from '../../format';
import {UserService} from '../../services/user.service';
import {ResidencyService} from '../../services/residency.service';
import {RETENTION_MONTHS, isDueForAnonymising} from '../../services/residency';
import {ResidentLinkService, residentLink} from '../../services/resident-link.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {Confirm} from '../confirm-dialog/confirm-dialog.component';
import {ResidentAvatarComponent} from '../shared/resident-avatar.component';
import {sortValue} from '../../table-sort';
import {ResidentDialogComponent} from './resident-dialog.component';

@Component({
  selector: 'app-users',
  imports: [DatePipe, MatButtonModule, MatCheckboxModule, MatIconModule, MatSortModule, MatTableModule, MatTooltipModule,
    TranslatePipe, ResidentAvatarComponent],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent {
  private readonly userService = inject(UserService);
  private readonly residency = inject(ResidencyService);
  private readonly links = inject(ResidentLinkService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(TranslateService);
  private readonly confirm = inject(Confirm);

  private readonly all = toSignal(this.userService.list(), {initialValue: []});
  private readonly sort = viewChild.required(MatSort);
  protected readonly table = new MatTableDataSource<User>([]);
  protected readonly displayedColumns = ['image', 'name', 'room', 'active', 'link', 'edit', 'moveOut', 'delete'];
  protected readonly movedOut = computed(() => this.all().filter(u => !!u.movedOutAt).sort((a, b) => millis(b.movedOutAt) - millis(a.movedOutAt)));
  protected readonly dueForAnonymising = computed(() => this.movedOut().filter(u => isDueForAnonymising(u)));
  protected readonly retentionMonths = RETENTION_MONTHS;
  protected readonly busy = signal(false);

  constructor() {
    this.table.sortingDataAccessor = (u, key) => sortValue(u[key as keyof User]);
    effect(() => this.table.sort = this.sort());
    effect(() => this.table.data = this.all().filter(u => !u.movedOutAt));
  }

  private t(key: string) {
    return this.i18n.t(key);
  }

  protected edit(user: User | null = null) {
    this.dialog.open<ResidentDialogComponent, User | null, UserFields>(ResidentDialogComponent, {width: '440px', maxWidth: '94vw', data: user})
      .afterClosed().subscribe(fields => {
        if (fields) {
          (user ? this.userService.update(user, fields) : this.userService.add(fields)).catch(this.notify.error);
        }
      });
  }

  protected setActive(user: User, active: boolean) {
    this.userService.update(user, {active}).catch(this.notify.error);
  }

  async remove(user: User) {
    if (await this.confirm.ask({title: `${this.t('DELETE')} ${user.name}?`, message: this.t('RESIDENTS_DELETE_CONFIRM'), confirm: this.t('DELETE'), danger: true})) {
      this.userService.delete(user).catch(this.notify.error);
    }
  }

  async moveOut(user: User) {
    await this.whileBusy(async () => {
      const s = await this.residency.summary(user);
      const ok = await this.confirm.ask({
        title: `${this.t('RESIDENTS_MOVE_OUT')}: ${user.name}`,
        details: [[this.t('RESIDENTS_THIS_MONTH'), kr(s.thisMonth, 2)], [this.t('RESIDENTS_LAST_12'), kr(s.last12Months, 2)]],
        message: this.t('RESIDENTS_MOVE_OUT_CONFIRM'),
        confirm: this.t('RESIDENTS_MOVE_OUT'),
      });
      if (ok) {
        await this.residency.moveOut(user);
      }
    });
  }

  async shareLink(user: User, renew = false) {
    try {
      const url = residentLink(renew ? await this.links.renew(user) : await this.links.linkFor(user));
      await this.notify.copy(url, `${this.t('RESIDENTS_LINK_COPIED')} ${user.name}`,
        {label: this.t('RESIDENTS_LINK_RENEW'), run: () => this.shareLink(user, true)});
    } catch (e) {
      this.notify.error(e);
    }
  }

  moveIn(user: User) {
    this.residency.moveIn(user).catch(this.notify.error);
  }

  async anonymise(users: User[]) {
    const who = users.length === 1 ? users[0].name : `${users.length} ${this.t('RESIDENTS_COUNT')}`;
    const ok = await this.confirm.ask({
      title: `${this.t('RESIDENTS_ANONYMISE')} ${who}?`, message: this.t('RESIDENTS_ANONYMISE_CONFIRM'), confirm: this.t('RESIDENTS_ANONYMISE'), danger: true,
    });
    if (!ok) {
      return;
    }
    await this.whileBusy(async () => {
      let purchases = 0;
      for (const u of users) {
        purchases += await this.residency.anonymise(u);
      }
      this.notify.info(`${this.t('RESIDENTS_ANONYMISED')} ${users.length} / ${purchases}`, 5000);
    });
  }

  private async whileBusy(work: () => Promise<void>) {
    this.busy.set(true);
    try {
      await work();
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
