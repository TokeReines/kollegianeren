import {Component, computed, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatTooltipModule} from '@angular/material/tooltip';
import {RouterLink} from '@angular/router';
import {AuthService, Role} from '../../services/auth.service';
import {AccessService} from '../../services/access.service';
import {Invite, Member, inviteLink, isOpen} from '../../interfaces/invite';
import {Notify} from '../../services/notify.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {Confirm} from '../confirm-dialog/confirm-dialog.component';
import {EXPORT_MAX_PURCHASES, ExportService, download, plain, purchasesCsv} from '../../services/export.service';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Firebase error codes when handing over, and what to say instead.
const HANDOVER_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'HANDOVER_WRONG_PASSWORD',
  'auth/wrong-password': 'HANDOVER_WRONG_PASSWORD',
  'auth/invalid-email': 'HANDOVER_BAD_EMAIL',
  'auth/invalid-new-email': 'HANDOVER_BAD_EMAIL',
  'auth/email-already-in-use': 'HANDOVER_EMAIL_TAKEN',
  'auth/too-many-requests': 'HANDOVER_TOO_MANY',
};

// "Adgang": the kitchen's logins and invites, and its data as files. Owners and treasurers only.
@Component({
  selector: 'app-access',
  imports: [RouterLink, DatePipe, FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule,
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
  private readonly exporter = inject(ExportService);

  protected readonly role = this.auth.role;
  protected readonly members = toSignal(this.access.members(), {initialValue: []});
  private readonly allInvites = toSignal(this.access.invites(), {initialValue: []});
  private readonly allReferrals = toSignal(this.access.referrals(), {initialValue: []});
  // Open invites only; used and expired ones are history.
  protected readonly invites = computed(() => this.allInvites().filter(i => isOpen(i)));
  protected readonly referrals = computed(() => this.allReferrals().filter(i => isOpen(i)));
  protected readonly kitchenId = toSignal(this.auth.kitchenId$, {initialValue: ''});
  protected readonly isLegacyOwner = computed(() => {
    const m = this.auth.membership();
    return !!m && m.uid === m.kitchenId;
  });
  // The list stores the email a login joined with; your own row shows the one you have now
  // (it changes when the login is handed over).
  protected readonly myUid = computed(() => this.auth.user()?.uid);
  protected readonly myEmail = computed(() => this.auth.user()?.email ?? '');
  protected readonly inviteRole = signal<Role>('tablet');
  protected readonly handOverEmail = signal('');
  protected readonly handOverPassword = signal('');
  protected readonly handOverSentTo = signal('');
  protected readonly busy = signal(false);
  protected readonly canHandOver = computed(() => EMAIL.test(this.handOverEmail().trim()) && !!this.handOverPassword()
    && this.handOverEmail().trim().toLowerCase() !== (this.auth.user()?.email ?? '').toLowerCase());

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

  // The owner moving out passes the login on to whoever takes over.
  protected async handOver() {
    const t = (k: string) => this.i18n.t(k);
    const email = this.handOverEmail().trim();
    if (!await this.confirm.ask({title: `${t('HANDOVER_CONFIRM')} ${email}?`, message: t('HANDOVER_CONFIRM_HINT'), confirm: t('HANDOVER_SEND')})) {
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.handOver(this.handOverPassword(), email);
      this.handOverSentTo.set(email);
      this.handOverEmail.set('');
    } catch (e) {
      const code = (e as {code?: string}).code ?? '';
      this.notify.error(HANDOVER_ERRORS[code] ? t(HANDOVER_ERRORS[code]) : e);
    } finally {
      this.handOverPassword.set('');
      this.busy.set(false);
    }
  }

  // "Hent jeres data": everything as one file, or the purchases as a spreadsheet, for a period.
  protected readonly exportMonths = signal<number | null>(12);
  protected readonly exporting = signal(false);
  protected readonly exportStatus = signal('');

  protected async export(kind: 'json' | 'csv') {
    this.exporting.set(true);
    try {
      const months = this.exportMonths();
      const n = await this.exporter.countPurchases(months);
      if (n > EXPORT_MAX_PURCHASES) {
        this.exportStatus.set(`${n} ${this.i18n.t('ACCESS_EXPORT_TOO_MANY')}`);
        return;
      }
      this.exportStatus.set(`${this.i18n.t('ACCESS_EXPORT_FETCHING')} ${n} ${this.i18n.t('ACCESS_EXPORT_PURCHASES')}`);
      const purchases = await this.exporter.purchases(months);
      const name = `kollegianeren-${(this.kitchenId() || 'kitchen').slice(0, 12)}-${new Date().toISOString().slice(0, 10)}`;
      if (kind === 'csv') {
        download(`${name}-koeb.csv`, purchasesCsv(purchases), 'text/csv;charset=utf-8');
      } else {
        const all = {exportedAt: new Date().toISOString(), ...(await this.exporter.kitchen()), purchases};
        download(`${name}.json`, JSON.stringify(plain(all), null, 2), 'application/json');
      }
      this.exportStatus.set(this.i18n.t('ACCESS_EXPORT_DONE'));
    } catch (err) {
      this.notify.error(err);
      this.exportStatus.set('');
    } finally {
      this.exporting.set(false);
    }
  }
}
