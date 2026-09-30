import {Component, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {NonNullableFormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {User, UserFields} from '../../interfaces/user';
import {TranslatePipe} from '../../translate.pipe';
import {ImagePickerComponent} from '../shared/image-picker.component';

// Adding a new resident (data null) or editing one. Closes with the resident's fields, or nothing.
@Component({
  selector: 'app-resident-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule,
    TranslatePipe, ImagePickerComponent],
  template: `
    <h2 mat-dialog-title>{{ (resident ? "RESIDENTS_EDIT_RESIDENT" : "RESIDENTS_NEW_RESIDENT") | translate }}</h2>
    <form mat-dialog-content [formGroup]="form" (ngSubmit)="save()" id="resident-form">
      <div class="fields">
        <mat-form-field class="name">
          <mat-label>{{ "NAME" | translate }}</mat-label>
          <input matInput formControlName="name" maxlength="60" autocomplete="off" cdkFocusInitial>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ "ROOM" | translate }}</mat-label>
          <input matInput formControlName="room" maxlength="10" autocomplete="off">
        </mat-form-field>
      </div>
      <app-image-picker kind="resident" [name]="name()" [(image)]="image" [(clId)]="clId" />
      <mat-checkbox formControlName="active">{{ "ACTIVE" | translate }}</mat-checkbox>
    </form>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">{{ "CANCEL" | translate }}</button>
      <button mat-flat-button type="submit" form="resident-form" [disabled]="form.invalid">{{ "SAVE" | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    form { display: flex; flex-direction: column; gap: 12px; }
    .fields { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
  `,
})
export class ResidentDialogComponent {
  protected readonly resident = inject<User | null>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ResidentDialogComponent, UserFields>>(MatDialogRef);
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.resident?.name ?? '', [Validators.required, Validators.maxLength(60)]],
    room: [this.resident?.room ?? '', [Validators.maxLength(10)]],
    active: [this.resident?.active ?? true],
  });
  // For the initials preview while typing.
  protected readonly name = toSignal(this.form.controls.name.valueChanges, {initialValue: this.form.controls.name.value});
  protected readonly image = signal(this.resident?.image ?? '');
  protected readonly clId = signal(this.resident?.clId ?? '');

  protected save() {
    if (this.form.invalid) {
      return;
    }
    const {name, room, active} = this.form.getRawValue();
    this.ref.close({name: name.trim(), room: room.trim(), active, image: this.image(), clId: this.clId()});
  }
}
