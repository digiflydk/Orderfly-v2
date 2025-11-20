
'use server';

import { getAdminDb } from "@/lib/firebase-admin";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import type { Brand, Location } from "@/types";

export type BrandDoc = Brand | null;
export type LocationDoc = Location | null;

export async function getBrandBySlug(slug: string): Promise<BrandDoc> {
  if (!slug) return null;
  const db = getAdminDb();
  try {
    const q = query(collection(db, "brands"), where("slug", "==", slug));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() } as Brand;
  } catch (err) {
      console.error(`[data.getBrandBySlug] Failed to fetch brand by slug '${slug}':`, err);
      return null;
  }
}

export async function getLocationsForBrand(brandId: string): Promise<Location[]> {
    const db = getAdminDb();
    const q = query(collection(db, 'locations'), where('brandId', '==', brandId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Location[];
}


export async function getLocationBySlug(brandId: string, locationSlug: string): Promise<LocationDoc> {
  const db = getAdminDb();
  const q = query(
    collection(db, "locations"),
    where("brandId", "==", brandId)
  );
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
      return null;
  }
  
  const lowerCaseSlug = locationSlug.toLowerCase();
  
  const locationDoc = querySnapshot.docs.find(doc => doc.data().slug.toLowerCase() === lowerCaseSlug);

  if (locationDoc) {
      const data = locationDoc.data();
      return { id: locationDoc.id, ...data } as Location;
  }

  return null;
}

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
    brandMatchesLocation: true,
  };
}
