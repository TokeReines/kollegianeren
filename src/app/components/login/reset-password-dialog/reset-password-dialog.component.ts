import { Component, Inject, Output, EventEmitter, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms';

@Component({
    selector: 'app-reset-password',
    templateUrl: 'reset-password-dialog.component.html',
    styleUrls: ['reset-password-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ResetPasswordDialogComponent implements OnInit {
  @Output() doSendEmail = new EventEmitter();
  form: UntypedFormGroup;

  constructor(
    public dialogRef: MatDialogRef<ResetPasswordDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { email: string, emailSent: boolean }) { }


  ngOnInit() {
    this.form = new UntypedFormGroup({
      email: new UntypedFormControl('', [Validators.required, Validators.email]),
    });
  }

  sendResetEmail(email): void {
    console.log('Sending reset email to: ' + email);
    this.doSendEmail.emit(email);
  }

}
