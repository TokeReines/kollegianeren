import {Injectable, inject} from '@angular/core';
import {Timestamp, getCountFromServer, doc, orderBy, query, where} from 'firebase/firestore';
import {getDoc, getDocs} from '../read-meter';
import {db} from '../firebase';
import {AuthService} from './auth.service';
import {kitchenCollection} from './kitchen-data';

// More purchases than this in one download is too much of the day's free reads (50,000 for every
// kitchen together); a shorter period, or Toke, then.
export const EXPORT_MAX_PURCHASES = 15000;

// "Hent jeres data" (Adgang): the kitchen's own data, as files, whenever it wants: residents,
// products, the food club and purchases for a period. Reads one document per thing; the purchases
// are counted first (1 read per 1,000) so a big download is stopped before it starts.
@Injectable({providedIn: 'root'})
export class ExportService {
  private readonly auth = inject(AuthService);

  private since(months: number | null) {
    const kid = this.auth.currentKitchenId;
    const purchases = kitchenCollection(kid, 'purchases');
    if (months == null) {
      return query(purchases, orderBy('timestamp'));
    }
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    return query(purchases, where('timestamp', '>=', Timestamp.fromDate(from)), orderBy('timestamp'));
  }

  countPurchases(months: number | null): Promise<number> {
    return getCountFromServer(this.since(months)).then(s => s.data().count);
  }

  async purchases(months: number | null): Promise<Record<string, unknown>[]> {
    return (await getDocs(this.since(months))).docs.map(d => ({id: d.id, ...d.data()}));
  }

  // Everything but the purchases: the kitchen, residents, products, the food club.
  async kitchen(): Promise<Record<string, unknown>> {
    const kid = this.auth.currentKitchenId;
    const all = async (name: 'users' | 'products' | 'meals') =>
      (await getDocs(kitchenCollection(kid, name))).docs.map(d => ({id: d.id, ...d.data()}));
    const [kitchen, users, products, meals] = await Promise.all([
      getDoc(doc(db, 'kitchens', kid)).then(d => d.data() ?? {}), all('users'), all('products'), all('meals')]);
    return {kitchen, residents: users, products, foodClub: meals};
  }
}

// Firestore timestamps as ISO text, for files.
export function plain(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(plain);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

// Purchases as a spreadsheet: semicolons and decimal commas, as Danish Excel reads it.
export function purchasesCsv(purchases: Record<string, unknown>[]): string {
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const kr = (n: unknown) => typeof n === 'number' ? n.toFixed(2).replace('.', ',') : '';
  const rows = purchases.map(p => {
    const at = p['timestamp'] instanceof Timestamp ? p['timestamp'].toDate() : null;
    return [at ? at.toLocaleDateString('da-DK') : '', at ? at.toLocaleTimeString('da-DK', {hour: '2-digit', minute: '2-digit'}) : '',
      p['userName'], p['userRoom'], p['productName'], p['amount'], kr(p['price'])].map(cell).join(';');
  });
  return ['Dato;Tid;Beboer;Værelse;Vare;Antal;Beløb (kr.)', ...rows].join('\r\n');
}

// Saves a file from the browser.
export function download(name: string, content: string, type: string) {
  // A byte order mark, so Excel reads the Danish letters.
  const blob = new Blob([type.startsWith('text/csv') ? '﻿' + content : content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
