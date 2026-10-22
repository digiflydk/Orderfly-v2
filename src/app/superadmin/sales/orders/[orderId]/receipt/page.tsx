import { notFound } from 'next/navigation';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { ReceiptPreview } from '@/components/receipts/receipt-preview';
import { projectReceipt } from '@/lib/receipts/preview';
import { getOrderDetails } from '@/lib/access/order-details';
import { orderflySession } from '@/lib/access/orderfly-session';
import { readReceiptSettingsForOrder } from '@/lib/receipts/settings-server';

export const dynamic = 'force-dynamic';

export default async function OrderReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  // Authenticate before looking up an order, then reuse its native brand/location authorization.
  const access = await orderflySession();
  const { orderId } = await params;
  const order = await getOrderDetails(orderId);
  if (!order) notFound();
  const { settings } = await readReceiptSettingsForOrder(order.brandId, order.locationId);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="outline" asChild><Link href={`/superadmin/sales/orders/${encodeURIComponent(order.id)}`}>Tilbage til ordre</Link></Button>
      {access.superuser && <Button variant="outline" asChild><Link href={`/superadmin/receipts?brandId=${encodeURIComponent(order.brandId)}`}>Rediger kvitteringslayout</Link></Button>}
    </div>
    <div><h1 className="text-2xl font-bold">Vis kvittering</h1><p className="text-muted-foreground">Forhåndsvisning med det aktuelle layout. Visningen opretter ingen printjob og er ikke en kopi af en tidligere papirudskrift.</p></div>
    {!order.invoice && <p className="rounded border p-3 text-sm">Der findes endnu ikke et gemt fakturabilag. Visningen viser ordrens registrerede oplysninger og betalingsstatus.</p>}
    <div className="rounded-lg bg-muted p-3 sm:p-6"><ReceiptPreview settings={settings} order={projectReceipt(order)} /></div>
  </div>;
}
