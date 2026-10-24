// Navigation intent only: never stores credentials, tokens or customer details.
export const checkoutReturnKey = (slug: string) => `club-checkout-return:${slug}`;
export const CHECKOUT_RETURN_TTL = 30 * 60 * 1000;
export function safeCheckoutReturn(value: unknown, slug: string, base: string): string | null {
  if (typeof value !== 'string' || value.length > 200) return null;
  const prefix = base === '/club' ? '' : base === `/${slug}/club` ? `/${slug}` : null;
  if (prefix === null || !value.startsWith(`${prefix}/`)) return null;
  const rest = value.slice(prefix.length);
  return /^\/[a-z0-9]+(?:-[a-z0-9]+)*\/checkout$/.test(rest) ? value : null;
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
