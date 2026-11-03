import { redirect } from 'next/navigation';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';
import { listClubAdminSummaries } from '@/lib/loyalty/stamp-card/club-admin-summary';
import { ClubOverview } from './club-overview';
import { overviewRow } from './overview-row';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ClubOverviewPage() {
  const session = await orderflySession().catch(() => null);
  if (!session) redirect('/admin-login');
  const summaries = await listClubAdminSummaries(getAdminDb(), { identity: session.identity, name: session.name },
    { superuser: session.superuser, now: Date.now() });
  if (!summaries.length) return <AccessDeniedPage />;
  return <ClubOverview rows={summaries.map(overviewRow)} showOmnisend={session.superuser} />;
}
