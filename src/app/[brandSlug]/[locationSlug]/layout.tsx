
import { getBrandBySlug } from '@/lib/data/brand-location';
import { BrandLayoutClient } from '../layout-client';
import type { Location } from '@/types';
import { getLocationBySlug } from '@/lib/data/brand-location';
import { resolveParams } from '@/lib/next/resolve-props';

export default async function LocationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandSlug: string, locationSlug: string }>;
}) {
  const { brandSlug, locationSlug } = await resolveParams(params);
  
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
