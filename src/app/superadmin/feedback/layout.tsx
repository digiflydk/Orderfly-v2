import { redirect } from 'next/navigation';
import { requireFeedbackAccess } from '@/lib/feedback/access';
export default async function FeedbackLayout({ children }: { children: React.ReactNode }) {
  try { await requireFeedbackAccess(); } catch { redirect('/feedback-admin/login'); }
  return children;
}
