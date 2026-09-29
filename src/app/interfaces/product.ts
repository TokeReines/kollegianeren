export interface Product {
  id: string;
  name: string;
  price: number;
  retailPrice: number;
  image: string;
  active: boolean;
  clId: string;
  // Units in stock; absent when the kitchen does not track stock for this product.
  stock?: number | null;
  // Warn when stock is at or below this (default LOW_STOCK_DEFAULT).
  lowStock?: number;
}

export const LOW_STOCK_DEFAULT = 5;

export function tracksStock(p: Product): boolean {
  return typeof p.stock === 'number';
}

export function isLowStock(p: Product): boolean {
  return tracksStock(p) && p.stock <= (p.lowStock ?? LOW_STOCK_DEFAULT);
}

// Sale price minus cost price, per unit.
export function margin(p: Product): number | null {
  const price = Number(p.price), cost = Number(p.retailPrice);
  return isFinite(price) && isFinite(cost) && p.retailPrice != null ? price - cost : null;
}
