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
