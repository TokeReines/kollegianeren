import {Injectable} from '@angular/core';
import {
  Timestamp, collection, deleteDoc, doc, getDoc, query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import {Observable} from 'rxjs';
import {filter, switchMap} from 'rxjs/operators';
import {AuthService, Role} from './auth.service';
import {auth, db, watch} from '../firebase';

export interface Invite {
  id: string;
  kitchenId: string | null;
  role: Role;
  createdBy: string;
  createdAt: any;
  expiresAt: any;
  usedBy: string | null;
  usedAt: any;
}

export interface Member {
  id: string;
  role: Role;
  email: string;
  joinedAt: any;
}

const INVITE_DAYS = 14;
// No 0/O, 1/I/l: codes get read aloud and typed on tablets.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function newCode(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}

export function inviteLink(code: string): string {
  return `${location.origin}/register?invite=${code}`;
}

// Access to a kitchen: its extra logins (members), invites to join it, and referral invites that
// let someone create a new kitchen. The rules (firestore.rules) are what actually enforce this.
@Injectable({
  providedIn: 'root'
})
export class AccessService {

  constructor(private auth: AuthService) {
  }

  members(): Observable<Member[]> {
    return this.auth.kitchenId.pipe(switchMap(kid => watch<Member>(collection(db, 'kitchens', kid, 'members'))));
  }

  invites(): Observable<Invite[]> {
    return this.auth.kitchenId.pipe(switchMap(kid =>
      watch<Invite>(query(collection(db, 'invites'), where('kitchenId', '==', kid)))));
  }

  referrals(): Observable<Invite[]> {
    return this.auth.user.pipe(filter(user => !!user), switchMap(user =>
      watch<Invite>(query(collection(db, 'invites'), where('createdBy', '==', user.uid), where('kitchenId', '==', null)))));
  }

  // role 'owner' with kitchenId null is a referral: the holder creates a new kitchen.
  async createInvite(role: Role, forNewKitchen = false): Promise<string> {
    const code = newCode();
    await setDoc(doc(db, 'invites', code), {
      kitchenId: forNewKitchen ? null : this.auth.currentKitchenId,
      role: forNewKitchen ? 'owner' : role,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + INVITE_DAYS * 864e5),
      usedBy: null,
      usedAt: null,
    });
    return code;
  }

  revoke(invite: Invite) {
    return deleteDoc(doc(db, 'invites', invite.id));
  }

  removeMember(member: Member) {
    const kid = this.auth.currentKitchenId;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'kitchens', kid, 'members', member.id));
    batch.delete(doc(db, 'memberships', member.id));
    return batch.commit();
  }

  rename(name: string) {
    const kid = this.auth.currentKitchenId;
    return setDoc(doc(db, 'kitchens', kid), {id: kid, name});
  }

  // For the register page, before an account exists.
  async lookup(code: string): Promise<{invite: Invite, kitchenName: string | null} | null> {
    const snap = await getDoc(doc(db, 'invites', code));
    if (!snap.exists()) {
      return null;
    }
    const invite = {id: snap.id, ...snap.data()} as Invite;
    let kitchenName = null;
    if (invite.kitchenId) {
      const k = await getDoc(doc(db, 'kitchens', invite.kitchenId));
      kitchenName = k.exists() ? k.get('name') : null;
    }
    return {invite, kitchenName};
  }

  // Redeems an invite for the signed-in user in one batch: marks it used, creates the new kitchen
  // for a referral, and writes the membership and member documents.
  async redeem(invite: Invite, newKitchenName?: string): Promise<string> {
    const user = auth.currentUser;
    const kitchenId = invite.kitchenId || doc(collection(db, 'kitchens')).id;
    const batch = writeBatch(db);
    batch.update(doc(db, 'invites', invite.id), {usedBy: user.uid, usedAt: serverTimestamp()});
    if (!invite.kitchenId) {
      batch.set(doc(db, 'kitchens', kitchenId), {id: kitchenId, name: newKitchenName.trim()});
    }
    batch.set(doc(db, 'memberships', user.uid), {kitchenId, role: invite.role, invite: invite.id, joinedAt: serverTimestamp()});
    batch.set(doc(db, 'kitchens', kitchenId, 'members', user.uid), {role: invite.role, email: user.email || '', joinedAt: serverTimestamp()});
    await batch.commit();
    return kitchenId;
  }
}
