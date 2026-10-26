
import { notFound, redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { getActiveLocationBySlug } from "@/app/superadmin/locations/actions";
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";
import { storefrontHref } from "@/lib/server/storefront-path";
import { managedDeliveryRequired } from "@/lib/delivery/quotes/adoption";

export const runtime = "nodejs";

export default async function CheckoutPage({
  params,
}: AsyncPageProps<{ brandSlug: string; locationSlug: string }>) {
  const { brandSlug, locationSlug } = await resolveParams(params);
  const brand = await getBrandBySlug(brandSlug);
  if (!brand) notFound();

  const location = await getActiveLocationBySlug(brand.id, locationSlug);
  if (!location) {
    redirect(await storefrontHref(brand.slug));
  }

  const managedDeliveryEnabled = await managedDeliveryRequired({ brandId: brand.id, locationId: location.id });

  return (
    <div className="bg-[var(--storefront-menu-background,#FFF8F0)] container mx-auto py-8 flex-1 max-w-[1140px] px-4">
      <CheckoutClient brand={brand} location={location} managedDeliveryEnabled={managedDeliveryEnabled} />
    </div>
  );
}
