// src/lib/resolve-active-location.ts
import { cookies } from "next/headers";
import { getActiveLocationBySlug, getLocationById } from "@/app/superadmin/locations/actions";
import type { Location } from "@/types";

/**
 * @deprecated This function is overly complex and has been replaced by a simpler lookup in the checkout page.
 */
export async function resolveActiveLocation(brandId: string): Promise<Location | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("of_location")?.value;
  if (!raw) return null;

  // This is a robust way to handle the cookie value, whether it's a simple slug or a full JSON object.
  // We prioritize the slug if it's a simple string.
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && parsed.id) {
      return await getLocationById(parsed.id);
    }
  } catch (e) {
    // It's not a JSON object, so treat it as a slug.
    return await getActiveLocationBySlug(brandId, raw);
  }
  
  // Fallback if parsing fails or object is malformed
  return await getActiveLocationBySlug(brandId, raw);
}
