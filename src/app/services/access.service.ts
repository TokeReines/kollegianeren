import {Injectable, inject} from '@angular/core';
import {Timestamp, collection, deleteDoc, doc, query, serverTimestamp, setDoc, where, writeBatch} from 'firebase/firestore';
import {getDoc} from '../read-meter';
import {Observable, filter, switchMap} from 'rxjs';
import {User} from 'firebase/auth';
import {AuthService, Role} from './auth.service';
import {INVITE_DAYS, Invite, Member, newCode} from '../interfaces/invite';
import {auth, db, watch} from '../firebase';
import {kitchenCollection, watchInKitchen} from './kitchen-data';
import {UsageService} from './usage.service';

function signedInUser(): User {
  if (!auth.currentUser) {
    throw new Error('Not signed in');
  }
  return auth.currentUser;
}

// Access to a kitchen: its extra logins (members), invites to join it, and referral invites that
// let someone create a new kitchen. The rules (firestore.rules) are what actually enforce this.
@Injectable({providedIn: 'root'})
export class AccessService {
  private readonly usage = inject(UsageService);
  private readonly auth = inject(AuthService);

  members(): Observable<Member[]> {
    return watchInKitchen<Member>(this.auth.kitchenId$, kid => kitchenCollection(kid, 'members'));
  }

  invites(): Observable<Invite[]> {
    return watchInKitchen<Invite>(this.auth.kitchenId$, kid => query(collection(db, 'invites'), where('kitchenId', '==', kid)));
  }

  referrals(): Observable<Invite[]> {
    return this.auth.user$.pipe(
      filter((user): user is User => !!user),
      switchMap(user => watch<Invite>(query(collection(db, 'invites'), where('createdBy', '==', user.uid), where('kitchenId', '==', null)))));
  }

  // role 'owner' with kitchenId null is a referral: the holder creates a new kitchen.
  async createInvite(role: Role, forNewKitchen = false): Promise<string> {
    this.usage.act('invite');
    const code = newCode();
    await setDoc(doc(db, 'invites', code), {
      kitchenId: forNewKitchen ? null : this.auth.currentKitchenId,
      role: forNewKitchen ? 'owner' : role,
      createdBy: signedInUser().uid,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + INVITE_DAYS * 864e5),
      usedBy: null,
      usedAt: null,
    });
    return code;
  }

  revoke(invite: Invite) {
    this.usage.act('invite-revoke');
    return deleteDoc(doc(db, 'invites', invite.id));
  }

  removeMember(member: Member) {
    this.usage.act('member-remove');
    const batch = writeBatch(db);
    batch.delete(doc(kitchenCollection(this.auth.currentKitchenId, 'members'), member.id));
    batch.delete(doc(db, 'memberships', member.id));
    return batch.commit();
  }

  rename(name: string) {
    this.usage.act('kitchen-rename');
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
    let kitchenName: string | null = null;
    if (invite.kitchenId) {
      const k = await getDoc(doc(db, 'kitchens', invite.kitchenId));
      kitchenName = k.exists() ? k.get('name') : null;
    }
    return {invite, kitchenName};
  }

  // Redeems an invite for the signed-in user in one batch: marks it used, creates the new kitchen
  // for a referral, and writes the membership and member documents.
  async redeem(invite: Invite, newKitchenName = ''): Promise<string> {
    const user = signedInUser();
    const kitchenId = invite.kitchenId || doc(collection(db, 'kitchens')).id;
    const batch = writeBatch(db);
    batch.update(doc(db, 'invites', invite.id), {usedBy: user.uid, usedAt: serverTimestamp()});
    if (!invite.kitchenId) {
      batch.set(doc(db, 'kitchens', kitchenId), {id: kitchenId, name: newKitchenName.trim()});
    }
    batch.set(doc(db, 'memberships', user.uid), {kitchenId, role: invite.role, invite: invite.id, joinedAt: serverTimestamp()});
    batch.set(doc(kitchenCollection(kitchenId, 'members'), user.uid), {role: invite.role, email: user.email || '', joinedAt: serverTimestamp()});
    await batch.commit();
    return kitchenId;
  }
}
