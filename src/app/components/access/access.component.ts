import {ChangeDetectionStrategy, Component} from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';
import {combineLatest} from 'rxjs';
import {map} from 'rxjs/operators';
import {AuthService, Role} from '../../services/auth.service';
import {AccessService, Invite, Member, inviteLink} from '../../services/access.service';
import {KitchenService} from '../../services/kitchen.service';
import {TranslateService} from '../../services/translate.service';

// "Adgang": the kitchen's name, its logins, and invites. Owners and treasurers only.
@Component({
  selector: 'app-access',
  templateUrl: './access.component.html',
  styleUrls: ['./access.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AccessComponent {
  role = this.auth.role;
  members = this.access.members();
  // Open invites only; used ones are history.
  invites = this.access.invites().pipe(map(list => list.filter(i => !i.usedBy)));
  referrals = this.access.referrals().pipe(map(list => list.filter(i => !i.usedBy)));
  kitchenName = combineLatest([this.auth.kitchenId, this.kitchens.list()]).pipe(
    map(([kid, all]) => all.find(k => k.id === kid)?.name || ''));
  newName = '';
  inviteRole: Role = 'tablet';
  isLegacyOwner = this.auth.membership.pipe(map(m => !!m && m.uid === m.kitchenId));

  constructor(
    private auth: AuthService,
    private access: AccessService,
    private kitchens: KitchenService,
    private translate: TranslateService,
    private snackBar: MatSnackBar,
  ) {
  }

  private t(key: string) {
    return this.translate.data[key] || key;
  }

  link(invite: Invite) {
    return inviteLink(invite.id);
  }

  async invite(forNewKitchen: boolean) {
    try {
      const code = await this.access.createInvite(this.inviteRole, forNewKitchen);
      await this.copy(inviteLink(code));
    } catch (e) {
      this.snackBar.open(e.message, 'OK', {duration: 6000});
    }
  }

  async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.snackBar.open(this.t('ACCESS_COPIED'), undefined, {duration: 3000});
    } catch {
      this.snackBar.open(text, 'OK', {duration: 15000});
    }
  }

  revoke(invite: Invite) {
    this.access.revoke(invite).catch(e => this.snackBar.open(e.message, 'OK', {duration: 6000}));
  }

  remove(member: Member) {
    if (confirm(`${this.t('ACCESS_REMOVE_CONFIRM')} ${member.email}?`)) {
      this.access.removeMember(member).catch(e => this.snackBar.open(e.message, 'OK', {duration: 6000}));
    }
  }

  rename() {
    const name = this.newName.trim();
    this.access.rename(name).then(() => this.newName = '', e => this.snackBar.open(e.message, 'OK', {duration: 6000}));
  }
}
