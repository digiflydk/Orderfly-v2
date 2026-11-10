import type { Metadata } from 'next';
import { GuestReplyClient } from './reply-client';

export const dynamic = 'force-dynamic';
// Personal conversation page: never indexed, never cached, no referrer leaks of the page URL.
export const metadata: Metadata = { title: 'Din samtale', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default function FeedbackReplyPage() {
  return <GuestReplyClient />;
}
