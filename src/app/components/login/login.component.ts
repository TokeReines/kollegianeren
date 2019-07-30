import { Component, OnInit, Inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ResetPasswordDialogComponent } from './reset-password-dialog/reset-password-dialog.component';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  hidePassword = true;

  constructor(private authService: AuthService,
    private router: Router,
    public dialog: MatDialog) {
  }

  ngOnInit() {
  }

  login() {
    this.authService.emailLogin(this.email, this.password)
      .then(() => this.router.navigate(['']));
  }

  handleButtonClicked(email) {
    this.authService.sendResetEmail(email);
  }

  openDialog() {
    console.log(this.email);
    const dialogRef = this.dialog.open(ResetPasswordDialogComponent, {
      data: { email: this.email }
    });
    dialogRef.componentInstance.emailSent.subscribe((email: string) => {
      this.authService.sendResetEmail(email);
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log(`Dialog result: ${result}`);
      dialogRef.componentInstance.emailSent.unsubscribe();
    });
  }

}
