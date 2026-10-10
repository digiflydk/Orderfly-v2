import { redirect } from 'next/navigation';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';

// Compatibility for old bookmarks. Subscription billing is retired in Orderfly.
export default async function BillingPage() {
  await requirePlatformSuperuser();
  redirect('/superadmin');
}
