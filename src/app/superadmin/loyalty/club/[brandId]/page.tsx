import { notFound, redirect } from 'next/navigation';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';
import { grantedBrands, loadClubAdminGrants, summaryForBrand } from '@/lib/loyalty/stamp-card/club-admin-summary';
import { newsletterConsentText } from '@/lib/marketing/consent';
import { ClubCampaignPanel } from '../club-campaign-panel';
import { MerchantSwitcher } from '../merchant-switcher';
import {
  campaignMissing, DiscountSection, MerchantHeader, merchantSteps, OmnisendSection, ProgramSections, ReadOnlyCampaign, Stepper, Warnings,
} from '../merchant-view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ClubMerchantPage({ params }: { params: Promise<{ brandId: string }> }) {
  const session = await orderflySession().catch(() => null);
  if (!session) redirect('/admin-login');
  const { brandId } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(brandId)) notFound();
  const db = getAdminDb(), grants = await loadClubAdminGrants(db, { identity: session.identity, name: session.name });
  const brands = grantedBrands(grants);
  // A brand outside the administrator's grants looks the same as one that does not exist.
  if (!brands.length) return <AccessDeniedPage />;
  if (!brands.some(brand => brand.brandId === brandId)) notFound();
  const summary = await summaryForBrand(db, grants, brandId, { superuser: session.superuser, now: Date.now() });
  const missing = campaignMissing(summary);
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <MerchantHeader summary={summary} />
      {brands.length > 1 && <MerchantSwitcher current={brandId} brands={brands.map(({ brandId, brandName }) => ({ brandId, brandName }))} />}
    </div>
    <Warnings summary={summary} />
    <div className="flex flex-wrap items-start gap-6">
      <div className="w-full lg:w-72 lg:flex-none"><Stepper steps={merchantSteps(summary)} /></div>
      <div className="min-w-0 flex-1 basis-[560px] space-y-4">
        <ProgramSections summary={summary} />
        {missing.length ? <ReadOnlyCampaign summary={summary} missing={missing} />
          : <ClubCampaignPanel key={brandId} brandId={brandId} preview={{ programName: summary.programName, newsletterText: newsletterConsentText(summary.brandName) }}>
              <DiscountSection summary={summary} />
            </ClubCampaignPanel>}
        <OmnisendSection summary={summary} />
      </div>
    </div>
  </div>;
}
