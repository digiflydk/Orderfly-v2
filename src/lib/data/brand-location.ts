
// src/lib/data/brand-location.ts
import { getAdminDb } from "@/lib/firebase-admin";

export type BrandDoc = {
  id: string;
  name?: string;
  slug?: string;
  // tilføj andre felter efter behov
};

export type LocationDoc = {
  id: string;
  name?: string;
  slug?: string;
  brandId?: string;
};

export async function getBrandBySlug(slug: string): Promise<BrandDoc | null> {
  const db = getAdminDb();
  // prøv felt 'slug', fallback til docId
  const byField = await db.collection("brands").where("slug", "==", slug).limit(1).get();
  if (!byField.empty) {
    const s = byField.docs[0];
    return { id: s.id, ...(s.data() as any) };
  }
  // fallback: docId==slug
  const doc = await db.collection("brands").doc(slug).get();
  if (doc.exists) return { id: doc.id, ...(doc.data() as any) };
  return null;
}

export async function getLocationBySlug(slug: string): Promise<LocationDoc | null> {
  const db = getAdminDb();
  const byField = await db.collection("locations").where("slug", "==", slug).limit(1).get();
  if (!byField.empty) {
    const s = byField.docs[0];
    return { id: s.id, ...(s.data() as any) };
  }
  const doc = await db.collection("locations").doc(slug).get();
  if (doc.exists) return { id: doc.id, ...(doc.data() as any) };
  return null;
}

export async function getBrandAndLocation(brandSlug: string, locationSlug: string) {
  const [brand, location] = await Promise.all([
    getBrandBySlug(brandSlug),
    getLocationBySlug(locationSlug),
  ]);

  return {
    brand,
    location,
    ok:
      !!brand &&
      !!location &&
      (!!(location as any).brandId ? (location as any).brandId === brand.id : true),
    brandMatchesLocation:
      !!brand && !!location && (!!(location as any).brandId ? (location as any).brandId === brand.id : true),
  };
}
