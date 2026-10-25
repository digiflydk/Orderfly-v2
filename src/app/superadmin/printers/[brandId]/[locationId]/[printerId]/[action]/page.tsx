import { notFound } from 'next/navigation';
import Link from 'next/link';
import { orderflySession } from '@/lib/access/orderfly-session';
import { nativeCatalog } from '@/lib/access/native-catalog';
import { canNavigate } from '@/lib/access/navigation';
import { readPrinterConfigurations } from '@/lib/printing/reads';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { PrinterActionPage } from '../../../../printer-action-page';

export const dynamic = 'force-dynamic';
const identifier = /^[A-Za-z0-9_-]{1,128}$/;

/** Navigation is read-only. Existing scoped APIs remain the sole mutation path. */
export default async function PrinterActionRoute({ params }: {
  params: Promise<{ brandId: string; locationId: string; printerId: string; action: string }>;
}) {
  const access = await orderflySession();
  if (!access.superuser || !canNavigate('/superadmin/printers', access)) return <AccessDeniedPage />;
  const { brandId, locationId, printerId, action } = await params;
  if (![brandId, locationId, printerId].every(value => identifier.test(value))
    || !['edit', 'deactivate', 'delete'].includes(action)) notFound();
  try {
    const permission = action === 'delete' ? 'orderfly.catalog:delete' : 'orderfly.catalog:edit';
    const [catalog, writable] = await Promise.all([nativeCatalog('orderfly.catalog:view'), nativeCatalog(permission)]);
    const brand = catalog.brands.find(row => row.id === brandId);
    const location = catalog.locations.find(row => row.id === locationId && row.brandId === brandId);
    if (!brand || !location || !writable.locations.some(row => row.id === locationId && row.brandId === brandId)) return <AccessDeniedPage />;
    const result = await readPrinterConfigurations({ brandId, locationId, printerId });
    if (!('item' in result) || !result.item || result.item.configuration.id !== printerId
      || result.item.configuration.brandId !== brandId || result.item.configuration.locationId !== locationId) throw new Error('printer_unavailable');
    return <PrinterActionPage key={`${access.actorId}:${brandId}:${locationId}:${printerId}:${action}:${result.item.revision}`}
      action={action as 'edit' | 'deactivate' | 'delete'} item={result.item} brandName={brand.name} locationName={location.name} />;
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 401 || status === 403) return <AccessDeniedPage />;
    return <div className="space-y-4"><p role="alert">{status === 404 ? 'Printeren findes ikke længere. Gå tilbage til printeroversigten.' : 'Printeren kunne ikke indlæses. Prøv igen senere.'}</p>
      <Link href="/superadmin/printers" className="underline">Tilbage til printeroversigten</Link></div>;
  }
}
