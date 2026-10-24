import { storefrontPath } from '@/lib/brand-subdomain';

// Navigation intent only: never stores credentials, tokens or customer details.
export const checkoutReturnKey = (slug: string) => `club-checkout-return:${slug}`;
export const CHECKOUT_RETURN_TTL = 30 * 60 * 1000;
export function safeCheckoutReturn(value: unknown, slug: string, base: string): string | null {
  if (typeof value !== 'string' || value.length > 200) return null;
  if (base !== '/club' && base !== `/${slug}/club`) return null;
  const parts = value.split('/');
  // Long form also exists on canonical hosts when a location shadows the brand
  // slug or a pass-through route (e.g. feedback). Never accept a foreign prefix.
  const long = parts.length === 4 && parts[0] === '' && parts[1] === slug;
  const short = base === '/club' && parts.length === 3 && parts[0] === '';
  if (!long && !short) return null;
  const location = parts[long ? 2 : 1];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(location) || parts.at(-1) !== 'checkout') return null;
  return value === storefrontPath(slug, false, location, 'checkout')
    || (base === '/club' && value === storefrontPath(slug, true, location, 'checkout')) ? value : null;
}
export function readCheckoutReturn(storage: Pick<Storage, 'getItem' | 'removeItem'>, slug: string, base: string, now: number): string | null {
  try {
    const entry = JSON.parse(storage.getItem(checkoutReturnKey(slug)) || 'null');
    if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now || entry.expiresAt > now + CHECKOUT_RETURN_TTL) {
      storage.removeItem(checkoutReturnKey(slug)); return null;
    }
    return safeCheckoutReturn(entry.path, slug, base);
  } catch { return null; }
}
