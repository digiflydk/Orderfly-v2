import { orderflySession } from '@/lib/access/orderfly-session';
import { nativeCatalog } from '@/lib/access/native-catalog';
import { canNavigate } from '@/lib/access/navigation';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { PrinterOverview } from './printer-overview';

export const dynamic = 'force-dynamic';

export default async function PrintersPage() {
  const access = await orderflySession();
  if (!canNavigate('/merchant/printers', access)) return <AccessDeniedPage />;
  try {
    // Only catalog:view scopes, not the union of unrelated selector permissions.
    const catalog = await nativeCatalog('orderfly.catalog:view');
    return <PrinterOverview brands={catalog.brands.map(({ id, name }) => ({ id, name }))}
      locations={catalog.locations.map(({ id, name, brandId }) => ({ id, name, brandId }))} />;
  } catch (error) {
    if ((error as { status?: number })?.status === 403) return <AccessDeniedPage />;
    return <div role="alert">Printeroversigten kunne ikke indlæses. Prøv igen senere.</div>;
  }
}
