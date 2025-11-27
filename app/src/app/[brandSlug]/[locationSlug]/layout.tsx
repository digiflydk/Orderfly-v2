import type { ReactNode } from "react";

type LocationLayoutInnerProps = {
  children: ReactNode;
  params: {
    brandSlug: string;
    locationSlug: string;
  };
};

// Important: props is typed as ANY so it does not have to satisfy LayoutProps
export default function LocationLayout(props: any) {
  const { children, params } = props as LocationLayoutInnerProps;

  // The await here is no longer needed since params is a plain object.
  // We'll keep the function async for now to avoid cascading changes, but the await is removed.
  const { brandSlug, locationSlug } = params;

  // behold evt. din eksisterende layout-struktur her
  // fx providers, wrappers osv.
  return <>{children}</>;
}
