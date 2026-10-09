import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflyReadGrants, requireOrderflyAccess } from '@/lib/access/orderfly-session';
import type { StorefrontOverview } from '@/lib/storefront-types';

const slug = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export async function getStorefrontOverview(): Promise<StorefrontOverview[]> {
  const grants = await orderflyReadGrants('orderfly.website:view');
  const db = getAdminDb();
  const result = await Promise.all(grants.map(async grant => {
    const snapshot = await db.collection('brands').doc(grant.brandId).get();
    if (!snapshot.exists) return null;
    const brand = snapshot.data()!;
    const locations = grant.locationIds === null
      ? (await db.collection('locations').where('brandId', '==', grant.brandId).get()).docs
      : await Promise.all(grant.locationIds.map(id => db.collection('locations').doc(id).get()));
    let canEditBrand = false;
    try {
      await requireOrderflyAccess(grant.brandId, null, 'orderfly.catalog:edit');
      canEditBrand = true;
    } catch (error) {
      if ((error as {status?: number}).status !== 403) throw error;
    }
    const href = slug(brand.slug) ? `/${brand.slug}` : null;
    return {
      id: snapshot.id, name: String(brand.name || snapshot.id),
      brandStatus: String(brand.status || 'unknown'), href, canEditBrand,
      locations: locations.filter(row => row.exists && row.data()?.brandId === grant.brandId).map(row => {
        const data = row.data()!;
        return {id: row.id, name: String(data.name || row.id), active: data.isActive === true,
          href: href && slug(data.slug) ? `${href}/${data.slug}` : null};
      }).sort((a, b) => a.name.localeCompare(b.name, 'da')),
    };
  }));
  return result.filter((row): row is StorefrontOverview => row !== null).sort((a, b) => a.name.localeCompare(b.name, 'da'));
}
