import { redirect } from 'next/navigation';
import Link from '@/components/superadmin/admin-link';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';
import { adminBrands } from '@/lib/loyalty/stamp-card/admin';
import { readDiscountCardAdmin } from '@/lib/loyalty/discount-card/admin';
import { DiscountCardAdmin } from './client-page';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DiscountCardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await orderflySession().catch(() => null);
  if (!session) redirect('/admin-login');
  if (!session.superuser) return <AccessDeniedPage />;
  const db = getAdminDb(), actor = { identity: session.identity, name: session.name };
  const brands = await adminBrands(db, actor, 'orderfly.stamp_cards:settings');
  const params = await searchParams, requested = Array.isArray(params.brand) ? params.brand[0] : params.brand;
  const brand = requested ? brands.find(item => item.brandId === requested) : brands[0];
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight">Rabatkort</h1>
      <p className="text-muted-foreground">Personlige kort med fast rabat. Kun superadmin kan administrere dem.</p></div>
    <nav aria-label="Vælg brand" className="flex flex-wrap gap-2">{brands.map(item =>
      <Link key={item.brandId} href={`/superadmin/loyalty/discount-card?brand=${encodeURIComponent(item.brandId)}`}
        aria-current={brand?.brandId === item.brandId ? 'page' : undefined}
        className={`rounded-md border px-3 py-2 text-sm ${brand?.brandId === item.brandId ? 'bg-primary text-primary-foreground' : 'bg-white'}`}>{item.brandName}</Link>)}</nav>
    {brand ? <DiscountCardAdmin key={brand.brandId} brandId={brand.brandId} brandName={brand.brandName}
      initial={await readDiscountCardAdmin(db, actor, brand.brandId)} /> : <p role="status">Vælg et tilgængeligt brand.</p>}
  </div>;
}
