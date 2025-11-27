
import type { ReactNode } from "react";

export const runtime = "nodejs";

type LocationLayoutProps = {
  children: ReactNode;
  params: {
    brandSlug: string;
    locationSlug: string;
  };
};

export default async function LocationLayout({ children, params }: LocationLayoutProps) {
  // Params are now correctly typed, no need to await
  return <>{children}</>;
}
