import { redirect } from 'next/navigation';
import { orderflySession } from '@/lib/access/orderfly-session';
import { merchantInstallMetadata } from '@/lib/server/merchant-home-screen';
export const generateMetadata = merchantInstallMetadata;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export default async function CounterEntry() {
  const session = await orderflySession().catch(() => null);
  if (!session) redirect('/login?next=%2Fmerchant%2Fstamp-card');
  redirect('/merchant/stamp-card');
}
