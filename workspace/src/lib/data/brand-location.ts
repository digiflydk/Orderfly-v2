// src/lib/data/brand-location.ts
import { getAdminDb } from "@/lib/firebase-admin";

export type BrandDoc = {
  id: string;
  name?: string;
  slug?: string;
};

export type LocationDoc = {
  id: string;
  name?: string;
  slug?: string;
  brandId?: string;
};

async function findBySlugOrId(col: string, slug: string) {
  const db = getAdminDb();

  // Try field "slug"
  try {
    const byField = await db.collection(col).where("slug", "==", slug).limit(1).get();
    if (!byField.empty) {
      const s = byField.docs[0];
      return { id: s.id, ...(s.data() as any) };
    }
  } catch {
    // ignore, fall through to docId
  }

  // Fallback: docId===slug
  try {
    const doc = await db.collection(col).doc(slug).get();
    if (doc.exists) return { id: doc.id, ...(doc.data() as any) };
  } catch {
    // ignore
  }
  return null;
}

export async function getBrandBySlug(slug: string): Promise<BrandDoc | null> {
  if (!slug) return null;
  const doc = await findBySlugOrId("brands", slug);
  return doc ? (doc as BrandDoc) : null;
}

export async function getLocationBySlug(slug: string): Promise<LocationDoc | null> {
  if (!slug) return null;
  const doc = await findBySlugOrId("locations", slug);
  return doc ? (doc as LocationDoc) : null;
}

export async function getBrandAndLocation(brandSlug: string, locationSlug: string) {
  const brand = await getBrandBySlug(brandSlug);
  const location = await getLocationBySlug(locationSlug);

  // compute links safely
  const hasBrand = !!brand?.id;
  const hasLocation = !!location?.id;
  const hasBrandIdField = typeof location?.brandId === "string" && !!location?.brandId;

  const brandMatchesLocation =
    hasBrand && hasLocation
      ? (hasBrandIdField ? location!.brandId === brand!.id : true)
      : false;

  // never throw – always return a descriptive object
  return {
    ok: hasBrand && hasLocation && brandMatchesLocation,
    brand,
    location,
    flags: {
      hasBrand,
      hasLocation,
      hasBrandIdField,
      brandMatchesLocation,
    },
    hints: {
      missing: !hasBrand && !hasLocation
        ? "Mangler både brand og location."
        : !hasBrand
        ? "Mangler brand."
        : !hasLocation
        ? "Mangler location."
        : undefined,
      link: hasLocation && !hasBrandIdField
        ? "location.brandId mangler (tilføj brandId)."
        : hasLocation && hasBrand && !brandMatchesLocation
        ? `location.brandId matcher ikke brand.id (${location!.brandId} ≠ ${brand!.id}).`
        : undefined,
    },
  };
}
