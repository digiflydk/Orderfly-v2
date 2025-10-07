// src/app/[brandSlug]/page.tsx
import { Suspense } from "react";

type Params = { brandSlug: string };
type Query = Record<string, string | string[] | undefined>;

type AsyncPageProps = {
  // Next 15 build-wrapper kan give disse som Promise i typerne
  params: Promise<Params> | Params;
  searchParams?: Promise<Query> | Query;
};

export async function generateMetadata({ params }: AsyncPageProps) {
  // håndter både Promise og plain object
  const routeParams = await Promise.resolve(params);
  const { brandSlug } = routeParams;
  return {
    title: `Brand • ${brandSlug}`,
  };
}

export default async function BrandPage({
  params,
  searchParams,
}: AsyncPageProps) {
  // normaliser til plain objects
  const routeParams = await Promise.resolve(params);
  const query = await Promise.resolve(searchParams ?? {});
  const { brandSlug } = routeParams;

  // eksempel på brug af query:
  // const someFilter = typeof query.filter === "string" ? query.filter : undefined;

  return (
    <Suspense>
      <div>
        <h1>{brandSlug}</h1>
        {/* TODO: Insert brand content */}
      </div>
    </Suspense>
  );
}
