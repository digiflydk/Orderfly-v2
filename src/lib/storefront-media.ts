import { createHash } from 'node:crypto';

export const mediaCollections = ['products', 'categories', 'brands', 'locations', 'comboMenus', 'settings'];
export const rasterData = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$/;
export function mediaVersion(value: string) { return createHash('sha256').update(value).digest('hex').slice(0, 24); }

// Keep existing data intact. Only the public rendering payload contains image URLs.
export function storefrontMedia<T>(value: T, collection: string, id: string, path: string[] = []): T {
  if (typeof value === 'string' && rasterData.test(value)) {
    const query = new URLSearchParams({ collection, id, field: path.join('.'), v: mediaVersion(value) });
    return `/api/storefront-image?${query}` as T;
  }
  if (value instanceof Date || !value || typeof value !== 'object') return value;
  if (typeof (value as any).toDate === 'function') return (value as any).toDate();
  if (Array.isArray(value)) return value.map((item, i) => storefrontMedia(item, collection, id, [...path, String(i)])) as T;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, storefrontMedia(item, collection, id, [...path, key])])) as T;
}
