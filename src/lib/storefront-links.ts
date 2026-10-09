import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { StorefrontLinks } from '@/lib/storefront-types';

// Read-only compatibility for existing footer links. No CMS activation, design,
// domains, private fields or timestamps are sent to the standard storefront.
export async function getStorefrontLinks(brandId: string): Promise<StorefrontLinks | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(brandId)) return null;
  const snapshot = await getAdminDb().doc(`brands/${brandId}/website/config`).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  const strings = (value: unknown, keys: string[]) => Object.fromEntries(keys.flatMap(key => {
    const item = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : null;
    return typeof item === 'string' ? [[key, item]] : [];
  }));
  return {social: strings(data?.social, ['facebook','instagram','tiktok','linkedin','x']),
    legal: strings(data?.legal, ['customCookiePolicy','customPrivacyPolicy','customTerms'])};
}
