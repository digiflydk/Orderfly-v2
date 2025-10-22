
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { BrandLayoutClient } from '../layout-client';
import type { Location } from '@/types';
import { getLocationBySlug } from '@/app/superadmin/locations/actions';

export default async function LocationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { brandSlug: string, locationSlug: string };
}) {
  const { brandSlug, locationSlug } = params;
  
  const brand = await getBrandBySlug(brandSlug);

  const fetchedLocation = brand ? await getLocationBySlug(brand.id, locationSlug) : null;

  // Validate smileyUrl only if location is found
  const rawUrl = (fetchedLocation?.smileyUrl || '').trim();
  const isValid = /^https?:\/\//i.test(rawUrl);
  const location: Location | null = fetchedLocation ? {
      ...fetchedLocation,
      smileyUrl: isValid ? rawUrl : undefined,
  } : null;

  return (
      <BrandLayoutClient brand={brand} location={location}>{children}</BrandLayoutClient>
  );
}
