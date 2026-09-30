import {Component, computed, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {switchMap} from 'rxjs';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatTooltipModule} from '@angular/material/tooltip';
import {AuthService, Role} from '../../services/auth.service';
import {AccessService} from '../../services/access.service';
import {Invite, Member, inviteLink, isOpen} from '../../interfaces/invite';
import {KitchenService} from '../../services/kitchen.service';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {Confirm} from '../confirm-dialog/confirm-dialog.component';

// "Adgang": the kitchen's name, its logins, and invites. Owners and treasurers only.
@Component({
  selector: 'app-access',
  imports: [DatePipe, FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatSelectModule, MatTooltipModule, TranslatePipe],
  templateUrl: './access.component.html',
  styleUrl: './access.component.scss',
})
export class AccessComponent {
  private readonly auth = inject(AuthService);
  private readonly access = inject(AccessService);
  private readonly notify = inject(Notify);
  private readonly i18n = inject(TranslateService);
  private readonly confirm = inject(Confirm);
  private readonly kitchens = inject(KitchenService);

  protected readonly role = this.auth.role;
  protected readonly members = toSignal(this.access.members(), {initialValue: []});
  private readonly allInvites = toSignal(this.access.invites(), {initialValue: []});
  private readonly allReferrals = toSignal(this.access.referrals(), {initialValue: []});
  // Open invites only; used and expired ones are history.
  protected readonly invites = computed(() => this.allInvites().filter(i => isOpen(i)));
  protected readonly referrals = computed(() => this.allReferrals().filter(i => isOpen(i)));
  protected readonly kitchenName = toSignal(this.auth.kitchenId$.pipe(switchMap(kid => this.kitchens.name(kid))), {initialValue: ''});
  protected readonly isLegacyOwner = computed(() => {
    const m = this.auth.membership();
    return !!m && m.uid === m.kitchenId;
  });
  protected readonly newName = signal('');
  protected readonly inviteRole = signal<Role>('tablet');

  protected link(invite: Invite) {
    return inviteLink(invite.id);
  }

  protected async invite(forNewKitchen: boolean) {
    try {
      await this.notify.copy(inviteLink(await this.access.createInvite(this.inviteRole(), forNewKitchen)));
    } catch (e) {
      this.notify.error(e);
    }
  }

  protected copy(text: string) {
    return this.notify.copy(text);
  }

  protected revoke(invite: Invite) {
    this.access.revoke(invite).catch(this.notify.error);
  }

  protected async remove(member: Member) {
    const t = (k: string) => this.i18n.t(k);
    if (await this.confirm.ask({title: `${t('ACCESS_REMOVE_CONFIRM')} ${member.email}?`, message: t('ACCESS_REMOVE_HINT'), confirm: t('ACCESS_REMOVE'), danger: true})) {
      this.access.removeMember(member).catch(this.notify.error);
    }
  }

  protected rename() {
    this.access.rename(this.newName().trim()).then(() => this.newName.set(''), this.notify.error);
  }
}
