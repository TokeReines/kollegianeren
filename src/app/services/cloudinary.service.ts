import {Injectable} from '@angular/core';
import {environment} from '../../environments/environment';

// Product and resident pictures live on Cloudinary. Uploads use an unsigned preset (no secrets in
// the app); dev and the emulator use the kollegianeren_dev preset, which uploads into the dev/ folder.
@Injectable({providedIn: 'root'})
export class CloudinaryService {
  readonly canUpload = !!environment.cloudinary.upload_preset;

  // Uploads a picture and returns its public id.
  async upload(file: File): Promise<string> {
    const data = new FormData();
    data.append('file', file);
    data.append('upload_preset', environment.cloudinary.upload_preset);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${environment.cloudinary.cloud_name}/image/upload`, {method: 'POST', body: data});
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.public_id) {
      throw new Error(body?.error?.message || `Upload failed (${res.status})`);
    }
    return body.public_id;
  }
}

// A delivery URL, e.g. clUrl(id, 'c_fit,q_50,w_75,h_75').
export function clUrl(publicId: string, transformation = '', format = 'png'): string {
  if (!publicId) {
    return '';
  }
  const t = transformation ? transformation + '/' : '';
  return `https://res.cloudinary.com/${environment.cloudinary.cloud_name}/image/upload/${t}${publicId}.${format}`;
}
