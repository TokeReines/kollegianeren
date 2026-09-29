import {Timestamp} from 'firebase/firestore';

// Firestore timestamps as numbers, 0 when missing (e.g. a write not yet confirmed offline).
export function millis(t: Timestamp | null | undefined): number {
  return t?.toMillis?.() ?? 0;
}
