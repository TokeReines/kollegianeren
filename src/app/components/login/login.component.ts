import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ResetPasswordDialogComponent } from './reset-password-dialog/reset-password-dialog.component';
import { TranslateService } from 'src/app/services/translate.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  hidePassword = true;
  emailSent = false;
  form!: FormGroup;
  currentLanguage = this.translate.getLanguage();


  constructor(private authService: AuthService,
    private router: Router,
    public dialog: MatDialog,
    private translate: TranslateService) {
  }

  ngOnInit() {
    this.form = new FormGroup({
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [Validators.required, Validators.minLength(6)]),
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
