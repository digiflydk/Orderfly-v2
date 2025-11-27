
'use server';
import 'server-only';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import { getBrandWebsiteHome } from '@/lib/superadmin/brand-website/home-actions';
import { notFound } from 'next/navigation';
import { BrandWebsiteHomeForm } from '@/components/superadmin/brand-website/home/BrandWebsiteHomeForm';
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";

type BrandHomeParams = {
  brandId: string;
};

export default async function BrandWebsiteHomePage({ params }: AsyncPageProps<BrandHomeParams>) {
  await requireSuperadmin();
  const { brandId } = await resolveParams(params);
  const homeConfig = await getBrandWebsiteHome(brandId);

  if (!homeConfig) {
    notFound();
  }

  return (
    <div className="space-y-6">
        <BrandWebsiteHomeForm brandId={brandId} initialHomeConfig={homeConfig} />
    </div>
  );
}
