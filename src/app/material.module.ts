import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule } from '@angular/material/dialog';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatToolbarModule } from '@angular/material/toolbar';

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
