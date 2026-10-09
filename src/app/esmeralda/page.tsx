import BrandLayout from '@/app/[brandSlug]/layout';
import BrandPage from '@/app/[brandSlug]/page';
import { GamePlacement } from '@/components/games/GamePlacement';
// Restaurant availability and brand settings must be read at request time.
export const dynamic = 'force-dynamic';

export default function EsmeraldaPage() {
  const params = Promise.resolve({brandSlug: 'esmeralda'});
  return <BrandLayout params={params}><BrandPage params={params} /><GamePlacement brandSlug="esmeralda" /></BrandLayout>;
}
