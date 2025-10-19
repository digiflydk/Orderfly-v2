
import type { AppTypes } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import { redirect, notFound } from "next/navigation";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export default async function Page({ params, searchParams }: AppTypes.AsyncPageProps) {
  const routeParams = await resolveParams(params);
  const query = await resolveSearchParams(searchParams);
  
  const { brandSlug } = routeParams;

  if (!brandSlug) {
    notFound();
  }
  
  const brand = await getBrandBySlug(brandSlug);
  if (!brand) notFound();

  // If a comfort cookie exists, try to use it - otherwise send to location selection
  const cookieSlug = cookies().get("of_location")?.value;
  if (cookieSlug) {
    redirect(`/${brand.slug}/${cookieSlug}/checkout`);
  }
  redirect(`/${brand.slug}`);
}
