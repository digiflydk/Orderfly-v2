
import { notFound, redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { getActiveLocationBySlug } from "@/app/superadmin/locations/actions";

export default async function CheckoutPage({
  params,
}: { params: Promise<{ brandSlug: string; locationSlug: string }> }) {
  const { brandSlug, locationSlug } = await params;
  const brand = await getBrandBySlug(brandSlug);
  if (!brand) notFound();

  const location = await getActiveLocationBySlug(brand.id, locationSlug);
  if (!location) {
    redirect(`/${brand.slug}`);
  }

  return (
    <div className="bg-[#FFF8F0] container mx-auto py-8 flex-1 max-w-[1140px] px-4">
      <CheckoutClient location={location} />
    </div>
  );
}
