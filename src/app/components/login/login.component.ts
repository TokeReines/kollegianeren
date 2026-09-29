import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ResetPasswordDialogComponent } from './reset-password-dialog/reset-password-dialog.component';
import { TranslateService } from '../../services/translate.service';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  hidePassword = true;
  emailSent = false;
  form: UntypedFormGroup;
  currentLanguage = this.translate.getLanguage();


  constructor(private authService: AuthService,
    private router: Router,
    public dialog: MatDialog,
    private translate: TranslateService) {
  }

  ngOnInit() {
    this.form = new UntypedFormGroup({
      email: new UntypedFormControl('', [Validators.required, Validators.email]),
      password: new UntypedFormControl('', [Validators.required, Validators.minLength(6)]),
    });
  }

  login() {
    this.authService.emailLogin(this.email, this.password)
      .then(() => this.router.navigate(['']));
  }

  openResetPasswordDialog() {
    const dialogRef = this.dialog.open(ResetPasswordDialogComponent, {
      data: { email: this.email, emailSent: this.emailSent }
    });
    dialogRef.componentInstance.doSendEmail.subscribe((email: string) => {
      this.authService.sendResetEmail(email);
      dialogRef.componentInstance.data.emailSent = true;
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log(`Dialog result: ${result}`);
      dialogRef.componentInstance.doSendEmail.unsubscribe();
    });
  }

}
