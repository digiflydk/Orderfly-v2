
'use server';
import 'server-only';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import { getBrandWebsiteMenuSettings } from '@/lib/superadmin/brand-website/menu-settings-actions';
import { notFound } from 'next/navigation';
import { BrandWebsiteMenuSettingsForm } from '@/components/superadmin/brand-website/menu-settings/BrandWebsiteMenuSettingsForm';
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";

type BrandWebsiteParams = {
  brandId: string;
};

export default async function BrandWebsiteMenuSettingsPage({ params }: AsyncPageProps<BrandWebsiteParams>) {
  await requireSuperadmin();
  const { brandId } = await resolveParams(params);
  
  const settings = await getBrandWebsiteMenuSettings(brandId);

  // If settings are null, it means no document exists yet.
  // We should provide a safe default to the form instead of crashing.
  const initialSettings: any = settings || {
    hero: null,
    gridLayout: 3,
    showPrice: true,
    showDescription: true,
    stickyCategories: true,
    defaultLocationId: null,
    updatedAt: null,
  };

  return (
    <div className="space-y-6">
      <BrandWebsiteMenuSettingsForm brandId={brandId} initialSettings={initialSettings} />
    </div>
  );
}
