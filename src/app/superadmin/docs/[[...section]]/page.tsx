import { redirect } from 'next/navigation';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
export default async function RetiredDocsPage() {
  await requirePlatformSuperuser();
  redirect('/superadmin/settings');
}
