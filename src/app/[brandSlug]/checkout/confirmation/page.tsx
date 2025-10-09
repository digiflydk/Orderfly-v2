
import type { AppTypes } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";

export const runtime = "nodejs";

export default async function CheckoutConfirmationPage({ params, searchParams }: AppTypes.AsyncPageProps) {
  const routeParams = await resolveParams(params);
  const query = await resolveSearchParams(searchParams);

  const { brandSlug } = routeParams;
  // fx: const orderId = typeof query.orderId === "string" ? query.orderId : undefined;

  return (
    <div className="p-6">
      {/* TODO: confirmation UI for {brandSlug} */}
    </div>
  );
}
