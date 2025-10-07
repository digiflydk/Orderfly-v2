// Ensretning af PageProps i Next 15 – params/searchParams kommer som Promise i typen.
declare namespace AppTypes {
  export type Params = Record<string, string>;
  export type Query = Record<string, string | string[] | undefined>;

  // Brug denne i pages og generateMetadata
  export type AsyncPageProps<P extends Params = Params, Q extends Query = Query> = {
    params: Promise<P>;
    searchParams?: Promise<Q>;
  };
}
