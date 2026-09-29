import {Component, inject, signal} from '@angular/core';
import {NonNullableFormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {Router, RouterLink} from '@angular/router';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {AuthService} from '../../services/auth.service';
import {TranslateService} from '../../services/translate.service';
import {TranslatePipe} from '../../translate.pipe';
import {LanguageButtonComponent} from '../language-button/language-button.component';
import {ResetPasswordDialogComponent} from './reset-password-dialog/reset-password-dialog.component';

// Firebase error codes for a wrong email or password.
const WRONG_LOGIN = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'];

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule,
    TranslatePipe, LanguageButtonComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly i18n = inject(TranslateService);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });
  protected readonly hidePassword = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected async login() {
    if (this.form.invalid || this.busy()) {
      return;
    }
    const {email, password} = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.emailLogin(email.trim(), password);
      await this.router.navigate(['']);
    } catch (e) {
      const code = (e as {code?: string}).code ?? '';
      this.error.set(WRONG_LOGIN.includes(code) ? this.i18n.t('LOGIN_FAILED') : (e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected forgotPassword() {
    this.dialog.open(ResetPasswordDialogComponent, {width: '420px', maxWidth: '94vw', data: this.form.controls.email.value});
  }
}
