// src/app/[brandSlug]/page.tsx
import { Suspense } from "react";

type Params = { brandSlug: string };
type Query = Record<string, string | string[] | undefined>;

type AsyncPageProps = {
  params: Promise<Params>; // vigtig: Promise, ingen union
  searchParams?: Promise<Query>; // vigtig: Promise eller undefined
};

export async function generateMetadata({ params }: AsyncPageProps) {
  const routeParams = await params;
  const { brandSlug } = routeParams;
  return {
    title: `Brand • ${brandSlug}`,
  };
}

export default async function BrandPage({ params, searchParams }: AsyncPageProps) {
  const routeParams = await params;
  const query = (await searchParams) ?? {};
  const { brandSlug } = routeParams;

  // eksempel: læs evt. filter fra query
  // const someFilter = typeof query.filter === "string" ? query.filter : undefined;

  return (
    <Suspense>
      <div>
        <h1>{brandSlug}</h1>
        {/* TODO: Indhold for brand */}
      </div>
    </Suspense>
  );
}
