import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {MatDialogRef} from '@angular/material';
import {Product} from '../../core/interfaces/product';
import {environment} from '../../../environments/environment';
import {HttpClient} from '@angular/common/http';

@Component({
  selector: 'app-add-product-dialog',
  templateUrl: './add-product-dialog.component.html'
})
export class AddProductDialogComponent implements OnInit {
  product = <Product>{};
  imageUrl: string;
  oldImageUrl: string;
  uploading: boolean;
  @ViewChild('clFileInput') clFileInput: ElementRef;

  constructor(public dialogRef: MatDialogRef<AddProductDialogComponent>, private httpClient: HttpClient) {
  }

  onNoClick(): void {
    this.dialogRef.close(null);
  }

  onYesClick(user) {
    this.dialogRef.close(user);
  }

  deleteImage() {
    this.product.image = '';
    this.product.clId = '';
  }

  revertImageUrl() {
    this.product.image = '';
  }

  setImageFromUrl() {
    this.oldImageUrl = this.product.image;
    this.product.image = this.imageUrl;
    this.product.clId = '';
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
        this.product.image = '';
        this.product.clId = clImage['public_id'];
      }, error => {
        this.uploading = false;
        console.log(error);
      });
  }

  openFileExplorer() {
    this.clFileInput.nativeElement.click();
  }

  ngOnInit(): void {
    this.imageUrl = this.product.image;
  }

}
