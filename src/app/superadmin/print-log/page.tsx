import { orderflySession } from '@/lib/access/orderfly-session';
import { nativeCatalog } from '@/lib/access/native-catalog';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { PrintLogOverview } from './print-log-overview';

export const dynamic = 'force-dynamic';

export default async function PrintLogPage() {
  const access = await orderflySession();
  if (!access.superuser) return <AccessDeniedPage />;
  try {
    const catalog = await nativeCatalog('orderfly.catalog:view');
    return <PrintLogOverview key={access.actorId}
      brands={catalog.brands.map(({ id, name }) => ({ id, name }))}
      locations={catalog.locations.map(({ id, name, brandId }) => ({ id, name, brandId }))} />;
  } catch (error) {
    if ((error as { status?: number })?.status === 403) return <AccessDeniedPage />;
    return <div role="alert">Print log kunne ikke indlæses. Prøv igen senere.</div>;
  }
}
