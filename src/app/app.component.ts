import { Component } from '@angular/core';
import {Cloudinary, CloudinaryImage} from '@cloudinary/url-gen';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'test';
  cloudinary!: Cloudinary;

  ngOnInit() {
    this.cloudinary = new Cloudinary({
      cloud:  {
        cloudName: 'egmontkollegiet-dev',
        apiKey: '847733283445576',
        apiSecret: 'oWrtkHnYekzL1ba-ks537vnWUXg'
      }
    });
  }
}
