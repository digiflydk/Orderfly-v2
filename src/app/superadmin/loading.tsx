import { PendingFeedback } from '@/components/superadmin/pending-feedback';

export default function Loading() {
  return <div className="min-h-48" aria-busy="true"><PendingFeedback /></div>;
}
