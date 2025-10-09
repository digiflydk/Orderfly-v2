
import { redirect, notFound } from "next/navigation";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { cookies } from "next/headers";

export default async function LegacyCheckoutPage({ params }: { params: { brandSlug: string } }) {
  const brand = await getBrandBySlug(params.brandSlug);
  if (!brand) notFound();

  // If a comfort cookie exists, try to use it - otherwise send to location selection
  const cookieSlug = cookies().get("of_location")?.value;
  if (cookieSlug) {
    redirect(`/${brand.slug}/${cookieSlug}/checkout`);
  }
  redirect(`/${brand.slug}`);
}
