import { orderflySession } from '@/lib/access/orderfly-session';
import { nativeCatalog } from '@/lib/access/native-catalog';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { PrinterRoutingEditor } from './routing-editor';
export const dynamic = 'force-dynamic';
export default async function PrinterRoutingPage() {
  const session = await orderflySession();
  if (!session.superuser) return <AccessDeniedPage />;
  try {
    const catalog = await nativeCatalog('orderfly.catalog:view');
    let editLocations: Array<{ id: string; brandId: string }> = [];
    try { editLocations = (await nativeCatalog('orderfly.catalog:edit')).locations.map(({ id, brandId }) => ({ id, brandId })); }
    catch (error) { if ((error as { status?: number })?.status !== 403) throw error; }
    return <PrinterRoutingEditor key={session.actorId} brands={catalog.brands.map(({ id, name }) => ({ id, name }))}
      locations={catalog.locations.map(({ id, name, brandId }) => ({ id, name, brandId }))} editLocations={editLocations} />;
  } catch (error) {
    if ((error as { status?: number })?.status === 403) return <AccessDeniedPage />;
    return <p role="alert">Routingreglerne kunne ikke indlæses. Prøv igen senere.</p>;
  }
}
