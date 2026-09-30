import {Injectable} from '@angular/core';
import {doc, getDoc} from 'firebase/firestore';
import {AdminStats} from '../interfaces/admin-stats';
import {db} from '../firebase';

// The maker's admin overview: one document, read once per visit (1 read).
@Injectable({providedIn: 'root'})
export class AdminService {
  async latest(): Promise<AdminStats | null> {
    const snap = await getDoc(doc(db, 'adminStats', 'latest'));
    return snap.exists() ? snap.data() as AdminStats : null;
  }
}
