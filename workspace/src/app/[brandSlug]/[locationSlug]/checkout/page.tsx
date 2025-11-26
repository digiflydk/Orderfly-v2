
import { notFound, redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { getActiveLocationBySlug } from "@/app/superadmin/locations/actions";

// Define a simple, local type for the page props, removing any dependency on a generic PageProps.
type CheckoutPageProps = {
  params: {
    brandSlug: string;
    locationSlug: string;
  };
  searchParams?: Record<string, string | string[] | undefined>;
};

export const runtime = "nodejs";

export default async function CheckoutPage({
  params,
}: CheckoutPageProps) {
  const brand = await getBrandBySlug(params.brandSlug);
  if (!brand) notFound();

  const location = await getActiveLocationBySlug(brand.id, params.locationSlug);
  if (!location) {
    redirect(`/${brand.slug}`);
  }

  return (
    <div className="bg-[#FFF8F0] container mx-auto py-8 flex-1 max-w-[1140px] px-4">
      <CheckoutClient location={location} />
    </div>
  );
}
