import { orderflySession } from '@/lib/access/orderfly-session';
import { nativeCatalog } from '@/lib/access/native-catalog';
import { canNavigate } from '@/lib/access/navigation';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { ReceiptEditor } from './receipt-editor';
import { KitchenEditor } from './kitchen-editor';

export const dynamic = 'force-dynamic';

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await orderflySession();
  if (!access.superuser || !canNavigate('/superadmin/receipts', access)) return <AccessDeniedPage />;
  try {
    const catalog = await nativeCatalog('orderfly.catalog:view');
    const query = await searchParams;
    const initialBrandId = typeof query.brandId === 'string' ? query.brandId : undefined;
    const testModel = query.model === 'mc-print2' || query.model === 'mc-print3' ? query.model : undefined;
    const testPaperWidthMm = query.paperWidthMm === '58' ? 58 : query.paperWidthMm === '80' ? 80 : undefined;
    if (query.type === 'kitchen') return <KitchenEditor key={`${access.actorId}:${initialBrandId ?? ''}:kitchen`} brands={catalog.brands.map(({ id, name }) => ({ id, name }))} initialBrandId={initialBrandId} />;
    return <ReceiptEditor key={`${access.actorId}:${initialBrandId ?? ''}`} brands={catalog.brands.map(({ id, name }) => ({ id, name }))}
      initialBrandId={initialBrandId} testModel={testModel} testPaperWidthMm={testPaperWidthMm} />;
  } catch (error) {
    if ((error as { status?: number })?.status === 403) return <AccessDeniedPage />;
    return <div role="alert">Kvitteringer kunne ikke indlæses. Prøv igen senere.</div>;
  }
}
