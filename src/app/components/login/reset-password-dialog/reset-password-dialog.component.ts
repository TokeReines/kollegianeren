import {Component, inject, signal} from '@angular/core';
import {FormControl, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AuthService} from '../../../services/auth.service';
import {TranslatePipe} from '../../../translate.pipe';

// "Forgot password": Firebase mails a reset link. Opened with the email typed on the login page.
@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslatePipe],
  template: `
    @if (!sent()) {
      <h2 mat-dialog-title>{{ "RESET_ENTER_EMAIL" | translate }}</h2>
      <form mat-dialog-content id="reset-form" [formGroup]="form" (ngSubmit)="send()">
        <mat-form-field class="full">
          <mat-label>{{ "EMAIL" | translate }}</mat-label>
          <input matInput type="email" formControlName="email" autocomplete="email">
        </mat-form-field>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </form>
      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close type="button">{{ "CLOSE" | translate }}</button>
        <button mat-flat-button type="submit" form="reset-form" [disabled]="email.invalid || busy()">{{ "RESET_PASSWORD" | translate }}</button>
      </mat-dialog-actions>
    } @else {
      <mat-dialog-content>
        <p>{{ "RESET_PASSWORD_CONFIRMATION" | translate }} {{ email.value }}</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-flat-button mat-dialog-close>{{ "OK" | translate }}</button>
      </mat-dialog-actions>
    }
  `,
  styles: `
    .full { width: 100%; }
    .error { color: var(--mat-sys-error); }
  `,
})
export class ResetPasswordDialogComponent {
  private readonly auth = inject(AuthService);
  protected readonly email = new FormControl(inject<string>(MAT_DIALOG_DATA) ?? '', {nonNullable: true, validators: [Validators.required, Validators.email]});
  // A <form> needs a form directive, or submitting it reloads the page.
  protected readonly form = new FormGroup({email: this.email});
  protected readonly sent = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async send() {
    if (this.email.invalid) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.sendResetEmail(this.email.value.trim());
      this.sent.set(true);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
