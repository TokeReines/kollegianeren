import {Product, byName} from '../../interfaces/product';

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
