import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {
  MatButtonModule,
  MatNativeDateModule,
  MatIconModule,
  MatSidenavModule,
  MatListModule,
  MatToolbarModule,
  MatCardModule,
  MatInputModule,
  MatSelectModule,
  MatCheckboxModule,
  MatDialogModule,
  MatMenuModule,
  MatGridListModule,
  MatBadgeModule,
  MatSnackBarModule,
  MatBottomSheetModule,
  MatDatepickerModule,
  MatSortModule, MatRadioModule, MatProgressSpinnerModule
} from '@angular/material';

@NgModule({
  imports: [CommonModule, MatButtonModule, MatToolbarModule, MatNativeDateModule, MatIconModule, MatSidenavModule, MatListModule,
    MatCardModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatDialogModule, MatMenuModule, MatGridListModule, MatBadgeModule,
    MatSnackBarModule, MatBottomSheetModule, MatDatepickerModule, MatSortModule, MatRadioModule, MatProgressSpinnerModule],
  exports: [CommonModule, MatButtonModule, MatToolbarModule, MatNativeDateModule, MatIconModule, MatSidenavModule, MatListModule,
    MatCardModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatDialogModule, MatMenuModule, MatGridListModule, MatBadgeModule,
    MatSnackBarModule, MatBottomSheetModule, MatDatepickerModule, MatSortModule, MatRadioModule, MatProgressSpinnerModule],
})
export class MaterialModule {
}
