import {Timestamp} from 'firebase/firestore';

// One purchase: the product and resident are copied in, so history survives renames and deletes.
export interface Purchase {
  id: string;
  amount: number;
  productId: string;
  productName: string;
  // Total for this purchase (unit price times amount).
  price: number;
  userId: string;
  userName: string;
  userRoom: string | null;
  timestamp: Timestamp;
}

export type NewPurchase = Omit<Purchase, 'id' | 'timestamp'>;

// Anyone in the kitchen (the tablet too) may take a purchase back for a minute after it was made;
// firestore.rules allows 60 s, and the app stops a little before, for the time the delete takes.
// After that only the owner and treasurer can.
export const TABLET_UNDO_MS = 55e3;
export function canTakeBack(madeAt: number, now: number, canManage: boolean): boolean {
  return canManage || now - madeAt < TABLET_UNDO_MS;
}
