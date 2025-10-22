
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { BrandLayoutClient } from '../../layout-client';
import type { Location } from '@/types';
import { getLocationBySlug } from '@/app/superadmin/locations/actions';

export default async function CheckoutLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { brandSlug: string; locationSlug: string };
}) {
  const { brandSlug, locationSlug } = params;

  const brand = await getBrandBySlug(brandSlug);
  const location = brand ? await getLocationBySlug(brand.id, locationSlug) : null;

  return (
    <BrandLayoutClient brand={brand} location={location}>
      {children}
    </BrandLayoutClient>
  );
}
