import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ResetPasswordDialogComponent } from './reset-password-dialog/reset-password-dialog.component';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  email = '';
  password = '';
  hidePassword = true;
  emailSent = false;

  constructor(private authService: AuthService,
    private router: Router,
    public dialog: MatDialog) {
  }

  login() {
    this.authService.emailLogin(this.email, this.password)
      .then(() => this.router.navigate(['']));
  }

  openDialog() {
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
