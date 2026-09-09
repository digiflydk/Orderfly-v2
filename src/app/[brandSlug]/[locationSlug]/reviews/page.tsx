import { notFound } from 'next/navigation';
import { getBrandAndLocation } from '@/lib/data/brand-location';
import { readPublicReviews } from '@/lib/feedback/public-reviews';
import { PublicReviewsView } from '@/components/feedback/public-reviews-view';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export default async function ReviewsPage({ params, searchParams }: { params: Promise<{ brandSlug: string; locationSlug: string }>; searchParams: Promise<{ after?: string }> }) {
  const { brandSlug, locationSlug } = await params;
  const { brand, location } = await getBrandAndLocation(brandSlug, locationSlug);
  if (!brand || !location || location.brandId !== brand.id) notFound();
  const page = await readPublicReviews(brand.id, location.id, (await searchParams).after);
  if (!page) notFound();
  const href = `/${encodeURIComponent(brandSlug)}/${encodeURIComponent(locationSlug)}`;
  return <PublicReviewsView locationName={location.name} menuHref={href} reviews={page.reviews} nextHref={page.next ? `${href}/reviews?after=${encodeURIComponent(page.next)}` : null} />;
}
