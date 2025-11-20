

import { isAdminReady } from '@/lib/runtime';
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { getLocationBySlug } from '@/app/superadmin/locations/actions';
import { BrandLayoutClient } from '../layout-client';
import type { Location } from '@/types';
import { resolveParams } from '@/lib/next/resolve-props';
import type { AsyncPageProps } from '@/types/next-async-props';

export const runtime = "nodejs";

export default async function LocationLayout({
  children,
  params,
}: AsyncPageProps<{ brandSlug?: string; locationSlug?: string }>) {
  const { brandSlug, locationSlug } = await resolveParams(params);
  const adminReady = isAdminReady();

  const brand = adminReady ? await getBrandBySlug(brandSlug) : null;
  const fetchedLocation = (adminReady && brand && locationSlug) 
    ? await getLocationBySlug(brand.id, locationSlug) 
    : null;

  const location: Location | null = fetchedLocation
    ? {
        ...(fetchedLocation as Location),
        smileyUrl:
          fetchedLocation.smileyUrl &&
          /^https?:\/\//i.test((fetchedLocation.smileyUrl || "").trim())
            ? (fetchedLocation.smileyUrl || "").trim()
            : undefined,
      }
    : null;

  return (
    <>
      {!adminReady && (
        <div className="bg-amber-100 text-amber-900 text-sm px-3 py-2 text-center">
          Running in limited mode (no Admin credentials). Public pages are available; Superadmin requires configuration.
        </div>
      )}
       <BrandLayoutClient brand={brand} location={location}>
        {children}
      </BrandLayoutClient>
    </>
  );
}
