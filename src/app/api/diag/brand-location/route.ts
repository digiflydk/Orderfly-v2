
// src/app/api/diag/brand-location/route.ts
import { NextResponse } from "next/server";
import { getBrandAndLocation } from "@/lib/data/brand-location";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "default-no-store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const brandSlug = searchParams.get("brandSlug") || "";
  const locationSlug = searchParams.get("locationSlug") || "";

  if (!brandSlug || !locationSlug) {
    return NextResponse.json(
      { ok: false, error: "Missing brandSlug or locationSlug" },
      { status: 400 }
    );
  }

  try {
    const result = await getBrandAndLocation(brandSlug, locationSlug);
    const status = result.ok ? 200 : 404;
    return NextResponse.json(
      {
        ok: result.ok,
        brandFound: !!result.brand,
        locationFound: !!result.location,
        brandId: result.brand?.id ?? null,
        locationId: result.location?.id ?? null,
        brandMatchesLocation: result.brandMatchesLocation,
        hint: !result.brand
          ? "Create brand with this slug"
          : !result.location
          ? "Create location with this slug and link brandId"
          : !result.brandMatchesLocation
          ? "location.brandId must equal brand.id"
          : "OK",
      },
      { status }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
