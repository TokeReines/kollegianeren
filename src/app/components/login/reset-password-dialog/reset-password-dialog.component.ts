import { Component, Inject, Output, EventEmitter, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormControl, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-reset-password',
  templateUrl: 'reset-password-dialog.component.html',
  styleUrls: ['reset-password-dialog.component.scss'],
})
export class ResetPasswordDialogComponent implements OnInit {
  @Output() doSendEmail = new EventEmitter();
  form!: FormGroup;

  constructor(
    public dialogRef: MatDialogRef<ResetPasswordDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { email: string, emailSent: boolean }) { }


  ngOnInit() {
    this.form = new FormGroup({
      email: new FormControl('', [Validators.required, Validators.email]),
    });
  }

  sendResetEmail(email: String): void {
    console.log('Sending reset email to: ' + email);
    this.doSendEmail.emit(email);
  }

}
