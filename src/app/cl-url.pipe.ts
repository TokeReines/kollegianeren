import {Pipe, PipeTransform} from '@angular/core';
import {environment} from '../environments/environment';

// Builds a Cloudinary delivery URL, e.g. {{ product.clId | clUrl:'c_fit,q_50,w_75,h_75' }}.
@Pipe({name: 'clUrl'})
export class ClUrlPipe implements PipeTransform {
  transform(publicId: string, transformation = '', format = 'png'): string {
    if (!publicId) {
      return '';
    }
    const t = transformation ? transformation + '/' : '';
    return `https://res.cloudinary.com/${environment.cloudinary.cloud_name}/image/upload/${t}${publicId}.${format}`;
  }
}
