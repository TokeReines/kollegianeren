import {Component, ElementRef, Inject, OnInit, ViewChild} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {Product} from '../../../interfaces/product';
import {environment} from '../../../../environments/environment';
import {HttpClient} from '@angular/common/http';


@Component({
  selector: 'app-edit-product-dialog',
  templateUrl: './edit-product-dialog.component.html',
})
export class EditProductDialogComponent implements OnInit {
  imageUrl!: string;
  oldImageUrl!: string;
  uploading!: boolean;
  @ViewChild('clFileInput') clFileInput!: ElementRef;

  constructor(public dialogRef: MatDialogRef<EditProductDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public product: Product, private httpClient: HttpClient) {
  }

  onNoClick(): void {
    this.dialogRef.close(null);
  }

  onYesClick(product: Product) {
    this.dialogRef.close(product);
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

  uploadClImage(files: FileList) {
    const url = 'https://api.cloudinary.com/v1_1/' + environment.cloudinary.cloud_name + '/image/upload/';
    const upload_preset = environment.cloudinary.upload_preset;
    const file = files.item(0);
    const data = new FormData();
    // data.append('file', file);
    // data.append('upload_preset', upload_preset);
    // this.uploading = true;
    // this.httpClient.post(url, data)
    //   .subscribe((clImage) => {
    //     this.uploading = false;
    //     this.product.image = '';
    //     this.product.clId = clImage['public_id'];
    //   }, error => {
    //     this.uploading = false;
    //     console.log(error);
    //   });
  }

  openFileExplorer() {
    this.clFileInput.nativeElement.click();
  }

  ngOnInit(): void {
    this.imageUrl = this.product.image;
  }
}
