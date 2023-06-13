import {Component, ElementRef, Inject, OnInit, ViewChild} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {User} from '../../../interfaces/user';
import {environment} from '../../../../environments/environment';
import {HttpClient} from '@angular/common/http';

@Component({
  selector: 'app-edit-user-dialog',
  templateUrl: './edit-user-dialog.component.html'
})
export class EditUserDialogComponent implements OnInit {
  imageUrl: string;
  oldImageUrl: string;
  uploading: boolean;
  @ViewChild('clFileInput') clFileInput: ElementRef;

  constructor(public dialogRef: MatDialogRef<EditUserDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public user: User, private httpClient: HttpClient) {
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

  ngOnInit(): void {
    this.imageUrl = this.user.image;
  }

}
