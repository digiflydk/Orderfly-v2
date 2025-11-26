// This file now only contains basic, non-conflicting type definitions.
// The problematic generic PageProps/LayoutProps have been removed.

export type Params = Record<string, string>;
export type Query = Record<string, string | string[] | undefined>;

export type AsyncPageProps<P extends Params = Params, Q extends Query = Query> = {
  params: P;
  searchParams?: Q;
};
