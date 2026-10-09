import { loadSuperadminPage } from '@/lib/access/superadmin-page';
import { getStorefrontOverview } from '@/lib/superadmin/storefront-overview';
import { StorefrontOverviewView } from '@/components/superadmin/storefront-overview';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';

export default async function BrandWebsitesPage() {
  const brands = await loadSuperadminPage('orderfly.website:view', getStorefrontOverview);
  return brands ? <StorefrontOverviewView brands={brands} /> : <AccessDeniedPage />;
}
