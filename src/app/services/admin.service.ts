import {Injectable} from '@angular/core';
import {Timestamp, doc} from 'firebase/firestore';
import {getDoc} from '../read-meter';
import {AdminStats} from '../interfaces/admin-stats';
import {db} from '../firebase';

export interface Nightly {
  backupAt: Timestamp | null;
  summariesAt: Timestamp;
}

// The maker's admin overview: two documents, read once per visit.
@Injectable({providedIn: 'root'})
export class AdminService {
  async latest(): Promise<AdminStats | null> {
    const snap = await getDoc(doc(db, 'adminStats', 'latest'));
    return snap.exists() ? snap.data() as AdminStats : null;
  }

  // When tokeserver's backup and the summaries made from it (ops/stats-summary.js) last ran.
  async nightly(): Promise<Nightly | null> {
    const snap = await getDoc(doc(db, 'adminStats', 'nightly'));
    return snap.exists() ? snap.data() as Nightly : null;
  }
}
