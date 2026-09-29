export interface Product {
  id: string;
  name: string;
  price: number;
  retailPrice: number | null;
  // A picture URL, or a Cloudinary public id in clId (uploads). At most one is set.
  image: string;
  clId: string;
  // In the fridge: shown on the buy page.
  active: boolean;
  // Units in stock; absent when the kitchen does not track stock for this product.
  stock?: number | null;
  // Warn when stock is at or below this (default LOW_STOCK_DEFAULT).
  lowStock?: number;
  // Units sold, counted up with every sale; orders the buy page (most bought first).
  sold?: number;
}

export type ProductFields = Omit<Product, 'id'>;
// What the product dialog edits.
export type EditableProduct = Pick<Product, 'name' | 'price' | 'retailPrice' | 'image' | 'clId' | 'active'>;

export const LOW_STOCK_DEFAULT = 5;

export function tracksStock<T extends object>(p: T & Pick<Product, 'stock'>): p is T & {stock: number} {
  return typeof p.stock === 'number';
}

export function isLowStock(p: Product): boolean {
  return tracksStock(p) && p.stock <= (p.lowStock ?? LOW_STOCK_DEFAULT);
}

// Sale price minus cost price, per unit.
export function margin(p: Product): number | null {
  const price = Number(p.price), cost = Number(p.retailPrice);
  return p.retailPrice != null && isFinite(price) && isFinite(cost) ? price - cost : null;
}

export function byName(a: {name: string}, b: {name: string}): number {
  return a.name.localeCompare(b.name, 'da');
}
