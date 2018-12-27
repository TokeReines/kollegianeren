import {Component, ElementRef, ViewChild} from '@angular/core';
import {MatDialogRef} from '@angular/material';
import {User} from '../../../interfaces/user';
import {environment} from '../../../../environments/environment';
import {HttpClient} from '@angular/common/http';

@Component({
  selector: 'app-add-user-dialog',
  templateUrl: './add-user-dialog.component.html'
})
export class AddUserDialogComponent {
  user = <User>{};
  imageUrl: string;
  oldImageUrl: string;
  uploading: boolean;
  @ViewChild('clFileInput') clFileInput: ElementRef;

  constructor(public dialogRef: MatDialogRef<AddUserDialogComponent>, private httpClient: HttpClient) {
  }

  onNoClick(): void {
    this.dialogRef.close(null);
  }

  onYesClick(user) {
    this.dialogRef.close(user);
  }

  deleteImage() {
    this.user.image = '';
    this.user.clId = '';
  }

  revertImageUrl() {
    this.user.image = '';
  }

  setImageFromUrl() {
    this.oldImageUrl = this.user.image;
    this.user.image = this.imageUrl;
    this.user.clId = '';
  }

  uploadClImage(files) {
    const url = 'https://api.cloudinary.com/v1_1/' + environment.cloudinary.cloud_name + '/image/upload/';
    const upload_preset = environment.cloudinary.upload_preset;
    const file = files.item(0);
    const data = new FormData();
    data.append('file', file);
    data.append('upload_preset', upload_preset);
    this.uploading = true;
    this.httpClient.post(url, data)
      .subscribe((clImage) => {
        this.uploading = false;
        this.user.image = '';
        this.user.clId = clImage['public_id'];
      }, error => {
        this.uploading = false;
        console.log(error);
      });
  }

  openFileExplorer() {
    this.clFileInput.nativeElement.click();
  }
}
