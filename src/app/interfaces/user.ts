export interface User {
  id: string;
  name: string;
  kitchen: string;
  room: string;
  image: string;
  active: boolean;
  clId: string;
  // Set when the resident moves out; cleared if they move back in.
  movedOutAt?: any;
  // Set once name, room and photo have been removed (see ResidencyService).
  anonymisedAt?: any;
}
