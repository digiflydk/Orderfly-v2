import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { LoyaltyAccount } from '@/components/loyalty/account';
import { notFound } from 'next/navigation';
export default async function LoyaltyPage({params}:{params:Promise<{brandSlug:string}>}) {
  const {brandSlug}=await params,brand=await getBrandBySlug(brandSlug);if(!brand)notFound();
  return <main className="mx-auto max-w-2xl p-6"><h1 className="mb-4 text-2xl font-bold">{brand.name} kundeklub</h1><LoyaltyAccount brandId={brand.id}/></main>;
}
