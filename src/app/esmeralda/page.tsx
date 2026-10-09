import BrandLayout from '@/app/[brandSlug]/layout';
import BrandPage from '@/app/[brandSlug]/page';
import { GamePlacement } from '@/components/games/GamePlacement';
export default function EsmeraldaPage() {
  const params = Promise.resolve({brandSlug: 'esmeralda'});
  return <BrandLayout params={params}><BrandPage params={params} /><GamePlacement brandSlug="esmeralda" /></BrandLayout>;
}
