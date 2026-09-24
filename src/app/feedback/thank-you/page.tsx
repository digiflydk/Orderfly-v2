import { FeedbackThankYouView } from '@/components/feedback/thank-you-view';
import { isEsmeraldaFeedback } from '@/lib/feedback/presentation';
import { getAdminDb } from '@/lib/firebase-admin';
import type { AsyncPageProps } from '@/types/next-async-props';
import { resolveSearchParams } from '@/lib/next/resolve-props';

export default async function ThankYouPage({ searchParams }: AsyncPageProps) {
  const query = await resolveSearchParams(searchParams);
  const language = query.lang === 'en' ? 'en' : 'da';
  const brandId = typeof query.brand === 'string' && /^[\w-]{1,160}$/.test(query.brand) ? query.brand : '';
  // Only public branding is loaded. No customer data or bearer token in this URL.
  const brand = brandId ? (await getAdminDb().collection('brands').doc(brandId).get()).data() : null;
  const name = typeof brand?.name === 'string' ? brand.name : '';
  const esmeralda = Boolean(brand) && isEsmeraldaFeedback(brandId);
  const href = esmeralda ? 'https://www.esmeraldapizza.dk' : typeof brand?.slug === 'string' && /^[a-z0-9-]+$/.test(brand.slug) ? `/${brand.slug}` : '/';
  return <FeedbackThankYouView brandId={brand ? brandId : ''} brandName={name} logoUrl={typeof brand?.logoUrl === 'string' ? brand.logoUrl : null} href={href} language={language} />;
}
