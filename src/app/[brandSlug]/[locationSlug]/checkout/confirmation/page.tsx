
import type { AppTypes } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";

export const runtime = "nodejs";

export default async function ConfirmationPage({ params, searchParams }: AppTypes.AsyncPageProps) {
  const routeParams = await resolveParams(params);
  const query = await resolveSearchParams(searchParams);

  const { brandSlug, locationSlug } = routeParams;

  return (
    <div className="p-6">
      {/* TODO: confirmation UI for {brandSlug}/{locationSlug} */}
    </div>
  );
}
