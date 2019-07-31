import { OnInit, Component, Inject, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';

@Component({
  selector: 'app-reset-password',
  templateUrl: 'reset-password-dialog.component.html',
  styleUrls: ['reset-password-dialog.component.scss'],
})
export class ResetPasswordDialogComponent {
  @Output() doSendEmail = new EventEmitter();

  constructor(
    public dialogRef: MatDialogRef<ResetPasswordDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { email: string, emailSent: boolean }) { }

  onNoClick(): void {
    this.dialogRef.close();
  }

  onSendResetEmail(email): void {
    console.log('Sending reset email to: ' + email);
    this.doSendEmail.emit(email);
  }

}
