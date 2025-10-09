
import { notFound, redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { getActiveLocationBySlug } from "@/app/superadmin/locations/actions";

export default async function CheckoutPage({
  params,
}: { params: { brandSlug: string; locationSlug: string } }) {
  const brand = await getBrandBySlug(params.brandSlug);
  if (!brand) notFound();

  const location = await getActiveLocationBySlug(brand.id, params.locationSlug);
  if (!location) {
    redirect(`/${brand.slug}`);
  }

  return (
    <div className="container mx-auto py-8 flex-1 max-w-[1140px] px-4">
      <CheckoutClient location={location} />
    </div>
  );
}
