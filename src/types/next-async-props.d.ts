// Ensret PageProps til Next 15: params/searchParams som Promise i typen
declare namespace AppTypes {
  export type Params = Record<string, string>;
  export type Query = Record<string, string | string[] | undefined>;
  export type AsyncPageProps<P extends Params = Params, Q extends Query = Query> = {
    params: Promise<P>;
    searchParams?: Promise<Q>;
  };
}
