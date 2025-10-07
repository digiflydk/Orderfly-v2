// src/app/[brandSlug]/page.tsx
import { Suspense } from "react";
import type { AppTypes } from "@/types/next-async-props"; // d.ts namespace reference
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";

export async function generateMetadata({ params }: AppTypes.AsyncPageProps) {
  const routeParams = await resolveParams(params);
  return { title: `Brand • ${routeParams.brandSlug}` };
}

export default async function BrandPage({
  params,
  searchParams,
}: AppTypes.AsyncPageProps) {
  const routeParams = await resolveParams(params);
  const query = await resolveSearchParams(searchParams);
  const { brandSlug } = routeParams;

  return (
    <Suspense>
      <div>
        <h1>{brandSlug}</h1>
        {/* TODO: indhold */}
      </div>
    </Suspense>
  );
}
