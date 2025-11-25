
'use server';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import { getBrandWebsiteHome } from '@/lib/superadmin/brand-website/home-actions';
import { notFound } from 'next/navigation';
import { BrandWebsiteHomeForm } from '@/components/superadmin/brand-website/home/BrandWebsiteHomeForm';

export default async function BrandWebsiteHomePage({ params }: { params: { brandId: string } }) {
  await requireSuperadmin();
  const homeConfig = await getBrandWebsiteHome(params.brandId);

  if (!homeConfig) {
    notFound();
  }

  return (
    <div className="space-y-6">
        <BrandWebsiteHomeForm brandId={params.brandId} initialHomeConfig={homeConfig} />
    </div>
  );
}
