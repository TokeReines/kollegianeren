import {Timestamp} from 'firebase/firestore';
import type {Role} from '../services/auth.service';

export interface Invite {
  id: string;
  kitchenId: string | null;
  role: Role;
  createdBy: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  usedBy: string | null;
  usedAt: Timestamp | null;
}

export interface Member {
  id: string;
  role: Role;
  email: string;
  joinedAt: Timestamp;
}

export const INVITE_DAYS = 14;
// No 0/O, 1/I/l: codes get read aloud and typed on tablets.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function newCode(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}

export function inviteLink(code: string): string {
  return `${location.origin}/register?invite=${code}`;
}

export function isOpen(invite: Invite, now = Date.now()): boolean {
  return !invite.usedBy && (invite.expiresAt?.toMillis() ?? 0) > now;
}
