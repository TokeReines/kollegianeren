import {paymentMessage, settlementId} from './components/accounting/accounting';

const texts: Record<string, string> = {
  ACCOUNTING_MESSAGE_OWE: 'Hej {name}! Køkkenregnskab {period}: {kr} kr.',
  ACCOUNTING_MESSAGE_PAY: 'MobilePay til {number}.',
  ACCOUNTING_MESSAGE_THANKS: 'Tak!',
  ACCOUNTING_MESSAGE_CREDIT: 'Hej {name}! Køkkenregnskab {period}: du har {kr} kr. til gode.',
};
const t = (k: string) => texts[k];

describe('Regnskab: paid and messages', () => {
  it('asks for the amount, with the MobilePay number when there is one', () => {
    expect(paymentMessage({name: 'Anna', total: 1234.5}, '1/9 til 30/9', '12345678', t))
      .toBe('Hej Anna! Køkkenregnskab 1/9 til 30/9: 1.234,50 kr. MobilePay til 12345678. Tak!');
    expect(paymentMessage({name: 'Bo', total: 35}, '1/9 til 30/9', ' ', t))
      .toBe('Hej Bo! Køkkenregnskab 1/9 til 30/9: 35,00 kr. Tak!');
  });

  it('tells a resident with money to get back (a food club cook) how much', () => {
    expect(paymentMessage({name: 'Cille', total: -180.4}, '1/9 til 30/9', '12345678', t))
      .toBe('Hej Cille! Køkkenregnskab 1/9 til 30/9: du har 180,40 kr. til gode.');
  });

  it('keys a settlement by its exact period', () => {
    expect(settlementId(new Date(2026, 8, 1), new Date(2026, 8, 30))).toBe('2026-09-01_2026-09-30');
  });
});
