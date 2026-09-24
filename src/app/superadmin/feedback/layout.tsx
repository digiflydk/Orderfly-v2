import { redirect } from 'next/navigation';
import { orderflySession } from '@/lib/access/orderfly-session';
import { requireFeedbackAccess } from '@/lib/feedback/access';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';

export default async function FeedbackLayout({ children }: { children: React.ReactNode }) {
  const session = await orderflySession().catch(() => null);
  if (!session) redirect('/admin-login');
  try { await requireFeedbackAccess(); } catch { return <AccessDeniedPage />; }
  return <>{children}</>;
}
