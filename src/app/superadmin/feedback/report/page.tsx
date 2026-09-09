import { getFeedbackReport } from '@/lib/feedback/report';
import { requireFeedbackAccess } from '@/lib/feedback/access';
import { feedbackScopeOptions } from '@/lib/feedback/admin-data';
import { FeedbackReportView } from './report-view';
export const dynamic = 'force-dynamic';
export default async function FeedbackReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const input = await searchParams;
  const access = await requireFeedbackAccess();
  try { return <FeedbackReportView report={await getFeedbackReport(input)} />; }
  catch (error) {
    const options = await feedbackScopeOptions(access);
    return <FeedbackReportView input={input} options={options} error={error instanceof Error && !('issues' in error) && !('code' in error) ? error.message : 'Rapporten kunne ikke indlæses. Kontrollér filtrene og prøv igen.'} />;
  }
}
