// src/app/api/superadmin/docs/superadmin-dump/route.ts
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';
import { getAdminDb } from '@/lib/firebase-admin';

type LocationSummary = {
  id: string;
  name: string;
  status: string;
};

type BrandSummary = {
  id: string;
  name: string;
  status: string;
  locationCount: number;
  locations: LocationSummary[];
};

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const db = await getAdminDb();

  const brandsSnap = await db.collection('brands').get();

  const brands: BrandSummary[] = [];
  for (const brandDoc of brandsSnap.docs) {
    const brandData = brandDoc.data();
    const locationsSnap = await db.collection('locations').where('brandId', '==', brandDoc.id).get();

    const locations: LocationSummary[] = locationsSnap.docs.map((locDoc) => {
      const locData = locDoc.data();
      return {
        id: locDoc.id,
        name: String(locData.name ?? ''),
        status: String(locData.isActive ? 'active' : 'inactive'),
      };
    });

    brands.push({
      id: brandDoc.id,
      name: String(brandData.name ?? ''),
      status: String(brandData.status ?? 'unknown'),
      locationCount: locations.length,
      locations,
    });
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    brandCount: brands.length,
    brands,
  });
}
