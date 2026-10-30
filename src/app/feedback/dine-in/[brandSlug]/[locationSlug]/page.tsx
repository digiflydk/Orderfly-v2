import { notFound } from 'next/navigation';
import type { AsyncPageProps } from '@/types/next-async-props';
import { resolveSearchParams } from '@/lib/next/resolve-props';
import { getDineInFeedbackContext } from '@/lib/feedback/dine-in';
import { FeedbackFormClient } from '@/app/feedback/form-client';

// A fresh submission nonce belongs to this visit, never a cached/public page.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Feedback om dit restaurantbesøg', robots: { index: false, follow: false } };

export default async function DineInFeedbackPage({ params, searchParams }: AsyncPageProps<{ brandSlug: string; locationSlug: string }>) {
  const { brandSlug, locationSlug } = await params;
  const query = await resolveSearchParams(searchParams);
  const language = query.lang === 'en' ? 'en' : 'da';
  const data = await getDineInFeedbackContext(brandSlug, locationSlug, language);
  if (!data) notFound();
  return <FeedbackFormClient context={data.context} questionsVersion={data.questionsVersion} />;
}
