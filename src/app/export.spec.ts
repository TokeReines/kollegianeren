import {Timestamp} from 'firebase/firestore';
import {plain, purchasesCsv} from './services/export.service';

describe('downloading a kitchen\'s data', () => {
  const at = Timestamp.fromDate(new Date(2026, 9, 1, 21, 5));

  it('writes purchases as a Danish spreadsheet: semicolons, decimal commas, quoted when needed', () => {
    const csv = purchasesCsv([
      {userName: 'Bo', userRoom: '211', productName: 'Øl', amount: 2, price: 12, timestamp: at},
      {userName: 'Ida; "B"', userRoom: null, productName: 'Cola', amount: 1, price: 6.5, timestamp: at},
    ]).split('\r\n');
    expect(csv[0]).toBe('Dato;Tid;Beboer;Værelse;Vare;Antal;Beløb (kr.)');
    expect(csv[1]).toBe('1.10.2026;21.05;Bo;211;Øl;2;12,00');
    expect(csv[2]).toBe('1.10.2026;21.05;"Ida; ""B""";;Cola;1;6,50');
  });

  it('turns timestamps into text, deep inside too', () => {
    expect(plain({a: at, list: [{b: at}], n: 1})).toEqual({a: at.toDate().toISOString(), list: [{b: at.toDate().toISOString()}], n: 1});
  });
});
