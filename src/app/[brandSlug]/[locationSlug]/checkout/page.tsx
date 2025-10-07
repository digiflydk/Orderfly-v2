
import { notFound, redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { getActiveLocationBySlug } from "@/app/superadmin/locations/actions";

export default async function CheckoutPage(props: any) {
  // Defensively read params to avoid type conflicts with Next.js generated types.
  const params = (props && typeof props === "object" ? (props as any).params : undefined) || {};
  const brandSlug = typeof params.brandSlug === "string" ? params.brandSlug : undefined;
  const locationSlug = typeof params.locationSlug === "string" ? params.locationSlug : undefined;

  if (!brandSlug || !locationSlug) {
    notFound();
  }

  const brand = await getBrandBySlug(brandSlug);
  if (!brand) notFound();

  const location = await getActiveLocationBySlug(brand.id, locationSlug);
  if (!location) {
    redirect(`/${brand.slug}`);
  }

  return (
    <div className="container mx-auto py-8 flex-1 max-w-[1140px] px-4">
      <CheckoutClient location={location} />
    </div>
  );
}
