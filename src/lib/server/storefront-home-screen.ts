import 'server-only';
import { getBrandBySlug } from '@/lib/data/brand-location';
import { getAdminDb } from '@/lib/firebase-admin';
import { storefrontInstallHostAllowed, type StorefrontHomeScreen } from '@/lib/storefront-home-screen';

export async function loadStorefrontHomeScreen(slug: string, host: string | null): Promise<(StorefrontHomeScreen & { logoUrl: string | null }) | null> {
  if (!storefrontInstallHostAllowed(slug, host)) return null;
  const brand = await getBrandBySlug(slug);
  if (!brand || brand.slug !== slug || brand.status === 'suspended') return null;
  let logoUrl = brand.logoUrl || null;
  // Public brand reads replace an inline upload with an image endpoint. Decode
  // the stored logo by this already resolved brand ID, never fetch a caller URL.
  if (logoUrl?.startsWith('/api/storefront-image?')) {
    const stored = (await getAdminDb().collection('brands').doc(brand.id).get()).data();
    if (!stored || stored.slug !== slug || stored.status === 'suspended') return null;
    logoUrl = typeof stored.logoUrl === 'string' ? stored.logoUrl : null;
  }
  const background = brand.appearances?.colors.background;
  return {
    slug: brand.slug,
    name: brand.name,
    logoUrl,
    background: background && /^#[0-9a-f]{6}$/i.test(background) ? background : '#ffffff',
  };
}
