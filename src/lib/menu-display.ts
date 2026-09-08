import type { ProductForMenu } from '@/types';
export type DisplayProduct = ProductForMenu & {displayCategoryId?: string};
export function flattenMenu(groups: Record<string, ProductForMenu[]>): DisplayProduct[] {
  return Object.entries(groups).flatMap(([displayCategoryId, products]) => products.map(product => ({...product, displayCategoryId})));
}
export function searchMenu<T extends {productName?: string; comboName?: string; description?: string}>(items: T[], search: string): T[] {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => terms.every(term => `${item.productName || item.comboName || ''} ${item.description || ''}`.toLocaleLowerCase().includes(term)));
}
