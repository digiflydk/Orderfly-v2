import { redirect } from 'next/navigation';
import Link from '@/components/superadmin/admin-link';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';
import { clubAdminBrands, readClubAdminSummary } from '@/lib/loyalty/stamp-card/club-admin-summary';
import { ClubSummary, missingPermissionText } from './club-summary';
import { ClubCampaignPanel } from './club-campaign-panel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ClubNewsletterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await orderflySession().catch(() => null);
  if (!session) redirect('/admin-login');
  const db = getAdminDb(), actor = { identity: session.identity, name: session.name };
  const brands = await clubAdminBrands(db, actor);
  if (!brands.length) return <AccessDeniedPage />;
  const params = await searchParams, requested = Array.isArray(params.brand) ? params.brand[0] : params.brand;
  const brand = brands.find(item => item.brandId === requested) ?? brands[0];
  const summary = await readClubAdminSummary(db, actor, brand.brandId, { superuser: session.superuser, now: Date.now() });
  const campaignMissing = (['settings', 'discountsEdit'] as const).filter(permission => !summary.permissions[permission]);
  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Club &amp; nyhedsbrev</h1>
      <p className="text-muted-foreground">Tilmelding til nyhedsbrev og Club samlet for ét brand: tilbud i checkout, rabat, stempler og tekster.</p>
    </div>
    {brands.length > 1 && <nav aria-label="Vælg brand" className="flex flex-wrap gap-2">{brands.map(item =>
      <Link key={item.brandId} href={`/superadmin/loyalty/club?brand=${encodeURIComponent(item.brandId)}`}
        aria-current={brand.brandId === item.brandId ? 'page' : undefined}
        className={`rounded-md border px-3 py-2 text-sm ${brand.brandId === item.brandId ? 'bg-primary text-primary-foreground' : 'bg-white'}`}>{item.brandName}</Link>)}</nav>}
    <h2 className="text-lg font-semibold">{summary.brandName}</h2>
    <ClubSummary summary={summary} />
    {campaignMissing.length
      ? <section aria-label="Club-kampagner" className="rounded-lg border p-4 sm:p-6"><h2 className="text-xl font-semibold">Club-kampagner</h2>
          <p role="note" className="mt-2 text-muted-foreground">{missingPermissionText(campaignMissing)} for hele brandet for at ændre tilbud i checkout og stempler.</p></section>
      : <ClubCampaignPanel key={brand.brandId} brands={[{ id: brand.brandId, name: brand.brandName }]} fixedBrandId={brand.brandId} />}
  </div>;
}
