import BrandLayout, { generateMetadata as generateBrandMetadata } from '@/app/[brandSlug]/layout';
import BrandPage from '@/app/[brandSlug]/page';
import { GamePlacement } from '@/components/games/GamePlacement';
// Restaurant availability and brand settings must be read at request time.
export const dynamic = 'force-dynamic';

// This static route takes precedence over /[brandSlug]. Rendering its layout
// as a component does not make Next inherit that layout's metadata hook.
export async function generateMetadata() {
  return generateBrandMetadata({ params: Promise.resolve({ brandSlug: 'esmeralda' }) });
}

export default function EsmeraldaPage() {
  const params = Promise.resolve({brandSlug: 'esmeralda'});
  return <BrandLayout params={params}><BrandPage params={params} /><GamePlacement brandSlug="esmeralda" /></BrandLayout>;
}
