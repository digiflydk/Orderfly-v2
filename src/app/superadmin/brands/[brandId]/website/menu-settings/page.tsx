'use server';
import 'server-only';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import { getBrandWebsiteMenuSettings } from '@/lib/superadmin/brand-website/menu-settings-actions';
import { notFound } from 'next/navigation';
import { BrandWebsiteMenuSettingsForm } from '@/components/superadmin/brand-website/menu-settings/BrandWebsiteMenuSettingsForm';

export default async function BrandWebsiteMenuSettingsPage({ params }: { params: { brandId: string } }) {
  await requireSuperadmin();
  
  const settings = await getBrandWebsiteMenuSettings(params.brandId);

  if (!settings) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <BrandWebsiteMenuSettingsForm brandId={params.brandId} initialSettings={settings} />
    </div>
  );
}
