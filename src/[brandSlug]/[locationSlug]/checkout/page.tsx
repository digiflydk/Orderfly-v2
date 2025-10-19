
import { notFound, redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { getActiveLocationBySlug } from "@/app/superadmin/locations/actions";

export const runtime = "nodejs";

type PageProps = {
  params: Promise<{ brandSlug: string; locationSlug: string }>;
};

export default async function CheckoutPage({ params }: PageProps) {
  const { brandSlug, locationSlug } = await params;
  
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
