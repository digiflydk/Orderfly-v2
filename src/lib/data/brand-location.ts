
'use server';

import { getAdminDb } from "@/lib/firebase-admin";
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { storefrontMedia } from '@/lib/storefront-media';
import type { Brand, Location } from "@/types";

export type BrandDoc = Brand | null;
export type LocationDoc = Location | null;

export async function getBrandBySlug(slug: string): Promise<BrandDoc> {
  return cachedBrand(slug);
}
const cachedBrand = cache(unstable_cache(async (slug: string): Promise<BrandDoc> => {
  if (!slug) return null;
  const db = getAdminDb();
  try {
    const q = db.collection("brands").where("slug", "==", slug).limit(1);
    const snap = await q.get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return storefrontMedia({ ...doc.data(), id: doc.id } as Brand, 'brands', doc.id);
  } catch (err) {
      console.error(`[data.getBrandBySlug] Failed to fetch brand by slug '${slug}':`, err);
      throw err;
  }
}, ['storefront-brand-v1'], {revalidate:60,tags:['storefront']}));

export async function getLocationsForBrand(brandId: string): Promise<Location[]> {
    const db = getAdminDb();
    const q = db.collection('locations').where('brandId', '==', brandId);
    const querySnapshot = await q.get();
    return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Location[];
}


export async function getLocationBySlug(brandId: string, locationSlug: string): Promise<LocationDoc> {
  return cachedLocation(brandId, locationSlug);
}
const cachedLocation = cache(unstable_cache(async (brandId: string, locationSlug: string): Promise<LocationDoc> => {
  const db = getAdminDb();
  const q = db.collection("locations").where("brandId", "==", brandId).where("slug", "==", locationSlug).limit(1);
  const querySnapshot = await q.get();
  if (querySnapshot.empty) {
      return null;
  }
  
  const locationDoc = querySnapshot.docs[0];
  const data = locationDoc.data();
  return storefrontMedia({ ...data, id: locationDoc.id } as Location, 'locations', locationDoc.id);
}, ['storefront-location-v1'], {revalidate: 60, tags: ['storefront']}));


export async function getBrandAndLocation(brandSlug: string, locationSlug: string) {
  const brand = await getBrandBySlug(brandSlug);
  if (!brand) {
      return { brand: null, location: null, ok: false, brandMatchesLocation: false };
  }
  const location = await getLocationBySlug(brand.id, locationSlug);

  return {
    brand,
    location,
    ok: !!location,
    brandMatchesLocation: !!location && location.brandId === brand.id,
  };
}
