import {Product, byName} from '../../interfaces/product';

export interface Line {
  product: Pick<Product, 'price'>;
  amount: number;
}

export interface BasketTotals {
  // What one buyer pays and gets; every buyer gets the whole basket.
  perPerson: number;
  unitsPerPerson: number;
  // For all buyers together (at least one, so an empty selection still shows a price).
  total: number;
  units: number;
}

export function basketTotals(lines: Line[], buyers: number): BasketTotals {
  const perPerson = lines.reduce((s, l) => s + l.product.price * l.amount, 0);
  const unitsPerPerson = lines.reduce((s, l) => s + l.amount, 0);
  const n = Math.max(1, buyers);
  return {perPerson, unitsPerPerson, total: perPerson * n, units: unitsPerPerson * n};
}

// Product ids, most bought first, then by name.
export function productOrder(products: Pick<Product, 'id' | 'name' | 'sold'>[]): string[] {
  return [...products].sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0) || byName(a, b)).map(p => p.id);
}

// "Anna, Bo og Cecilie".
export function joinNames(items: string[], and: string): string {
  return items.length > 1 ? items.slice(0, -1).join(', ') + and + items[items.length - 1] : items[0] ?? '';
}

// "Anna og Bo købte 2 Squash og 1 Cola hver".
export function describeSale(names: string[], items: [number, string][], words: {and: string, bought: string, each: string}): string {
  const what = joinNames(items.map(([n, name]) => `${n} ${name}`), words.and);
  return joinNames(names, words.and) + words.bought + what + (names.length > 1 ? words.each : '');
}
