import { ReprintControls } from '@/components/receipts/reprint-controls';
import { notFound } from 'next/navigation';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { KitchenReceiptPreview } from '@/components/receipts/kitchen-receipt-preview';
import { projectKitchenReceipt } from '@/lib/receipts/kitchen-preview';
import { getOrderDetails } from '@/lib/access/order-details';
import { orderflySession } from '@/lib/access/orderfly-session';
import { readKitchenSettingsForOrder } from '@/lib/receipts/kitchen-settings-server';
import { readKitchenCategoriesForOrder } from '@/lib/receipts/kitchen-categories-server';

export const dynamic = 'force-dynamic';

export default async function OrderKitchenReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const access = await orderflySession();
  const { orderId } = await params;
  const order = await getOrderDetails(orderId);
  if (!order) notFound();
  const { settings } = await readKitchenSettingsForOrder(order.brandId, order.locationId);
  const categories = settings.groupByCategory ? await readKitchenCategoriesForOrder(order) : {};
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="outline" asChild><Link href={`/superadmin/sales/orders/${encodeURIComponent(order.id)}`}>Tilbage til ordre</Link></Button>
      <Button variant="outline" asChild><Link href={`/superadmin/sales/orders/${encodeURIComponent(order.id)}/receipt`}>Vis kundekvittering</Link></Button>
      {access.superuser && <Button variant="outline" asChild><Link href={`/superadmin/receipts?type=kitchen&brandId=${encodeURIComponent(order.brandId)}`}>Rediger køkkenbon</Link></Button>}
    </div>
    <div><h1 className="text-2xl font-bold">Vis køkkenbon</h1><p className="text-muted-foreground">Forhåndsvisning af ordrens registrerede varer og menuvalg. Visningen sender ikke noget til printeren.</p></div>
    <p className="text-sm text-muted-foreground">Kategorier følger det aktuelle varekatalog. Varer uden en tilgængelig kategori vises stadig. Telefon vises kun, når nummeret er gemt på ordren og valgt til i opsætningen.</p>
    {access.superuser && <ReprintControls orderId={order.id} brandId={order.brandId} locationId={order.locationId} kind="kitchen" />}
    <div className="rounded-lg bg-muted p-3 sm:p-6"><KitchenReceiptPreview settings={settings} order={projectKitchenReceipt(order, categories)} /></div>
  </div>;
}
