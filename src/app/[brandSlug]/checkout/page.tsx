
import { redirect, notFound } from "next/navigation";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { cookies } from "next/headers";

export default async function LegacyCheckoutPage({ params }: { params: Promise<{ brandSlug: string }> }) {
  const { brandSlug } = await params;
  const brand = await getBrandBySlug(brandSlug);
  if (!brand) notFound();

  // If a comfort cookie exists, try to use it - otherwise send to location selection
  const cookieStore = await cookies();
  const cookieSlug = cookieStore.get("of_location")?.value;
  if (cookieSlug) {
    redirect(`/${brand.slug}/${cookieSlug}/checkout`);
  }
  redirect(`/${brand.slug}`);
}
