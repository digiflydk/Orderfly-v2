import 'server-only';
import { headers } from 'next/headers';
import { brandSlugFromHost } from '@/lib/brand-subdomain';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { AuthorityError, principalKey, type VerifiedIdentity } from '@/lib/access/authority';
import { authorize, policySchema } from '@/lib/access/policy';
import type { TerminalLocation } from './terminal-types';

/** Server-created context, never accepted from a client or persisted between requests. */
export type KdsScope = { locations: TerminalLocation[]; editableLocationIds: string[]; identity: VerifiedIdentity };
export async function resolveKdsScope(): Promise<KdsScope> {
  const requestHeaders = await headers();
  const slug = brandSlugFromHost(requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || '');
  if (!slug) throw new AuthorityError('forbidden');
  const identity = await verifiedOrderflyIdentity(), db = getAdminDb();
  return db.runTransaction(async tx => {
    const [brands, saved] = await Promise.all([
      tx.get(db.collection('brands').where('slug', '==', slug).limit(2)),
      tx.get(db.collection('platformAdminControl').doc('access-v1')),
    ]);
    const parsed = policySchema.safeParse(saved.data());
    if (brands.docs.length !== 1 || !parsed.success) throw new AuthorityError('forbidden');
    const brand = brands.docs[0], policy = parsed.data;
    const company = policy.companies.find(row => row.orderflyBrandIds.includes(brand.id));
    if (!company) throw new AuthorityError('forbidden');
    const native = await tx.get(db.collection('locations').where('brandId', '==', brand.id).limit(201));
    if (native.docs.length > 200) throw new AuthorityError('scope_too_large', 409);
    const locations: TerminalLocation[] = [], editableLocationIds: string[] = [];
    for (const location of native.docs) {
      if (location.data().brandId !== brand.id) continue;
      const request = { principalId: principalKey(identity), companyId: company.id, locationIds: [location.id] };
      if (!authorize(policy, { ...request, permission: 'orderfly.orders:view' }).allowed) continue;
      const brandData = brand.data(), data = location.data();
      locations.push({ brandId: brand.id, locationId: location.id,
        brandName: String(brandData.name || brandData.brandName || slug),
        locationName: String(data.name || data.locationName || location.id) });
      if (authorize(policy, { ...request, permission: 'orderfly.orders:edit' }).allowed) editableLocationIds.push(location.id);
    }
    if (!locations.length) throw new AuthorityError('forbidden');
    locations.sort((a, b) => a.locationId.localeCompare(b.locationId));
    return { locations, editableLocationIds, identity };
  }, { readOnly: true });
}
