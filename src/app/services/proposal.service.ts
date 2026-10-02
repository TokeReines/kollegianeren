import {Injectable, inject} from '@angular/core';
import {
  Timestamp, addDoc, collection, collectionGroup, deleteDoc, deleteField, doc, limit, onSnapshot, orderBy, query, serverTimestamp,
  updateDoc, where, writeBatch,
} from 'firebase/firestore';
import {Observable, catchError, of, shareReplay, switchMap} from 'rxjs';
import {db, watch} from '../firebase';
import {NEWS_DAYS} from '../interfaces/kollegiet';
import {MAKER, Proposal, ProposalComment, ProposalStatus} from '../interfaces/proposal';
import {AuthService} from './auth.service';
import {watchInKitchen, whileSignedIn} from './kitchen-data';
import {UsageService} from './usage.service';

export type ProposalFields = Pick<Proposal, 'title' | 'body' | 'images' | 'status'>;

// Forslag (docs/aktuelt.md). The page lists them all (few, small); the shell keeps the recently
// changed ones open for the strip and the bell. Comments are read when a proposal is opened, and
// counted live on the list.
@Injectable({providedIn: 'root'})
export class ProposalService {
  private readonly usage = inject(UsageService);
  private readonly auth = inject(AuthService);

  list(): Observable<Proposal[]> {
    return watchInKitchen<Proposal>(this.auth.kitchenId$, () => query(collection(db, 'proposals'), orderBy('createdAt', 'desc'), limit(50)));
  }

  readonly recent$: Observable<Proposal[]> = whileSignedIn(this.auth.kitchen$,
    () => watch<Proposal>(query(collection(db, 'proposals'), where('updatedAt', '>', Timestamp.fromMillis(Date.now() - NEWS_DAYS * 864e5)),
      orderBy('updatedAt', 'desc'), limit(10))), [] as Proposal[]).pipe(shareReplay({bufferSize: 1, refCount: true}));

  comments(id: string): Observable<ProposalComment[]> {
    return watch<ProposalComment>(query(collection(db, 'proposals', id, 'comments'), orderBy('createdAt'), limit(300)));
  }

  // Every proposal's number of comments, live: one listener on all comments (a read each when the
  // page opens, one per new comment after).
  commentCounts(): Observable<Record<string, number>> {
    return this.auth.kitchenId$.pipe(switchMap(() => new Observable<Record<string, number>>(sub => onSnapshot(
      collectionGroup(db, 'comments'),
      snap => {
        const counts: Record<string, number> = {};
        for (const d of snap.docs) {
          const id = d.ref.parent.parent?.id;
          if (id) {
            counts[id] = (counts[id] ?? 0) + 1;
          }
        }
        sub.next(counts);
      },
      err => sub.error(err))).pipe(catchError(() => of({})))));
  }

  // The maker's.
  create(fields: ProposalFields) {
    return addDoc(collection(db, 'proposals'),
      {...fields, votes: {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), statusAt: serverTimestamp()});
  }

  update(p: Proposal, fields: ProposalFields) {
    return updateDoc(doc(db, 'proposals', p.id),
      {...fields, updatedAt: serverTimestamp(), ...(fields.status !== p.status ? {statusAt: serverTimestamp()} : {})});
  }

  setStatus(p: Proposal, status: ProposalStatus) {
    return this.update(p, {title: p.title, body: p.body, images: p.images, status});
  }

  // The maker's answer, with pictures; it counts as a change to the proposal.
  reply(p: Proposal, text: string, images: string[]) {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'proposals', p.id, 'comments')), {from: MAKER, text, images, createdAt: serverTimestamp()});
    batch.update(doc(db, 'proposals', p.id), {updatedAt: serverTimestamp()});
    return batch.commit();
  }

  // A kitchen's comment, text only. Shares the 30 second limit with posts on the board.
  comment(p: Proposal, text: string) {
    this.usage.act('proposal-comment');
    const kid = this.auth.currentKitchenId;
    const batch = writeBatch(db);
    const ref = doc(collection(db, 'proposals', p.id, 'comments'));
    batch.set(ref, {from: kid, text, images: [], createdAt: serverTimestamp()});
    batch.set(doc(db, 'seen', kid), {lastPostAt: serverTimestamp(), lastPostId: ref.id}, {merge: true});
    return batch.commit();
  }

  // The kitchen's own, for five minutes; the maker's always.
  removeComment(p: Proposal, c: ProposalComment) {
    return deleteDoc(doc(db, 'proposals', p.id, 'comments', c.id));
  }

  // A kitchen's thumbs up, on or off.
  vote(p: Proposal, on: boolean) {
    this.usage.act('proposal-vote');
    return updateDoc(doc(db, 'proposals', p.id), {[`votes.${this.auth.currentKitchenId}`]: on ? true : deleteField()});
  }
}
