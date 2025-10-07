
import { redirect, notFound } from "next/navigation";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export default async function BrandCheckoutRootPage(props: any) {
  // OF-537: defensive props handling (Next may pass Promise<any>)
  const rawParams = (props && typeof props === "object") ? (props as any).params : undefined;
  const rawSearch = (props && typeof props === "object") ? (props as any).searchParams : undefined;
  const params = await Promise.resolve(rawParams ?? {});
  const searchParams = await Promise.resolve(rawSearch ?? {});

  const brandSlug =
    typeof params.brandSlug === "string" ? params.brandSlug : undefined;

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
