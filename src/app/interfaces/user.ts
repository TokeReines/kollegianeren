import {Timestamp} from 'firebase/firestore';

// A resident of the kitchen (the `users` collection; not a login).
export interface User {
  id: string;
  name: string;
  kitchen: string;
  room: string;
  // A picture URL, or a Cloudinary public id in clId (uploads). At most one is set.
  image: string;
  clId: string;
  // Shown on the buy page.
  active: boolean;
  // Set when the resident moves out; cleared if they move back in.
  movedOutAt?: Timestamp | null;
  // Set once name, room and photo have been removed (see ResidencyService).
  anonymisedAt?: Timestamp | null;
}

export type UserFields = Pick<User, 'name' | 'room' | 'image' | 'clId' | 'active'>;

// Rooms are numbers on this dorm ("701"), but sort sensibly if one is not.
export function byRoom(a: {room: string}, b: {room: string}): number {
  return String(a.room ?? '').localeCompare(String(b.room ?? ''), 'da', {numeric: true});
}
