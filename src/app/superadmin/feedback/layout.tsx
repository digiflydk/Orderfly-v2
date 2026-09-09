import { redirect } from 'next/navigation';
import { requireFeedbackAccess, temporaryFeedbackTestAccessEnabled } from '@/lib/feedback/access';
export default async function FeedbackLayout({ children }: { children: React.ReactNode }) {
  try { await requireFeedbackAccess(); } catch { redirect('/feedback-admin/login'); }
  return <>{temporaryFeedbackTestAccessEnabled() && <div role="status" className="mb-4 rounded-md border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950">Midlertidig feedback-testadgang er aktiv. Brug kun dummydata. Slå indstillingen fra, før rigtige kundeoplysninger anvendes.</div>}{children}</>;
}
