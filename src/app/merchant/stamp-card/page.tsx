import { getAdminDb } from '@/lib/firebase-admin';
import { orderflyReadGrants, orderflySession } from '@/lib/access/orderfly-session';
import { canNavigate } from '@/lib/access/navigation';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { COLLECTIONS, readProgram } from '@/lib/loyalty/stamp-card/model';
import { CounterView, type CounterBrand } from './counter-view';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Brands and active locations where the employee may use the counter, with each
// program's current status. Every action is authorized again by the API.
export default async function StampCardCounterPage() {
  const session = await orderflySession();
  if (!canNavigate('/merchant/stamp-card', session)) return <AccessDeniedPage />;
  const grants = await orderflyReadGrants('orderfly.stamp_cards:counter').catch(() => []);
  const db = getAdminDb();
  const brands: CounterBrand[] = (await Promise.all(grants.map(async grant => {
    const [brand, locations, program] = await Promise.all([
      db.collection('brands').doc(grant.brandId).get(),
      db.collection('locations').where('brandId', '==', grant.brandId).get(),
      db.collection(COLLECTIONS.programs).doc(grant.brandId).get(),
    ]);
    const s = readProgram(grant.brandId, program.data()).settings;
    return {
      id: grant.brandId, name: String(brand.data()?.name || grant.brandId),
      locations: locations.docs.filter(doc => doc.data().isActive !== false && (grant.locationIds === null || grant.locationIds.includes(doc.id)))
        .map(doc => ({ id: doc.id, name: String(doc.data().name || doc.id) })).sort((a, b) => a.name.localeCompare(b.name, 'da')),
      program: { active: s.active, name: s.name, counterChannels: s.counterChannels, idleMinutes: s.counterIdleMinutes },
    };
  }))).filter(brand => brand.locations.length).sort((a, b) => a.name.localeCompare(b.name, 'da'));
  return <CounterView employee={{ id: session.actorId, name: session.name }} brands={brands}
    adminHref={canNavigate('/superadmin', session) ? '/superadmin' : null} />;
}
