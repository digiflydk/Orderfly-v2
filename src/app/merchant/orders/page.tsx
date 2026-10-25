import { orderflySession } from '@/lib/access/orderfly-session';
import { canNavigate } from '@/lib/access/navigation';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { TerminalClient } from './terminal-client';

export const dynamic = 'force-dynamic';
export default async function MerchantOrdersPage() {
  const access = await orderflySession();
  if (!canNavigate('/merchant/orders', access)) return <AccessDeniedPage />;
  return <TerminalClient />;
}
