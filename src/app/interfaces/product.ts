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
  // Units in stock; absent when the kitchen does not track stock for this product ("Følg lager").
  stock?: number | null;
  // Warn when stock is at or below this (default LOW_STOCK_DEFAULT).
  lowStock?: number;
  // Units sold, counted up with every sale; orders the buy page (most bought first).
  sold?: number;
  // What it is, for battles between the kitchens ("most beers"). Absent until a manager sets it.
  category?: ProductCategory | null;
}

export const PRODUCT_CATEGORIES = ['beer', 'cider', 'soda', 'water', 'wine', 'spirits', 'snack', 'other'] as const;
export type ProductCategory = typeof PRODUCT_CATEGORIES[number];

// Battles about "most beers" count only products set as beer: a kitchen with none scores 0.
// False until the products have loaded, so nothing is said about a list not yet there.
export function lacksBeer(products: Pick<Product, 'active' | 'category'>[]): boolean {
  return products.length > 0 && !products.some(p => p.active && p.category === 'beer');
}

export type ProductFields = Omit<Product, 'id'>;
// What the product dialog edits.
export type EditableProduct = Pick<Product, 'name' | 'price' | 'retailPrice' | 'image' | 'clId' | 'active' | 'category'>;

// A new product: what the dialog edits, and the stock to start from if it is to be tracked.
export type NewProduct = EditableProduct & Pick<Product, 'stock'>;

export const LOW_STOCK_DEFAULT = 5;

export function tracksStock<T extends object>(p: T & Pick<Product, 'stock'>): p is T & {stock: number} {
  return typeof p.stock === 'number';
}

// Units left of a product with tracked stock, never below 0; null when stock is not tracked.
// A tracked product cannot be bought beyond this, and shows as sold out at 0: it never disappears.
export function stockLeft(p: Pick<Product, 'stock'>): number | null {
  return typeof p.stock === 'number' ? Math.max(0, p.stock) : null;
}

// Whether `amount` each for `buyers` people fits in what is left. Always true without tracked stock.
export function fitsStock(p: Pick<Product, 'stock'>, amount: number, buyers: number): boolean {
  const left = stockLeft(p);
  return left === null || amount * Math.max(1, buyers) <= left;
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
