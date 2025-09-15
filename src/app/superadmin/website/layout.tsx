import type { ReactNode } from "react";
import CmsLayout from "./_cmsLayout";

export default function Layout({ children }: { children: ReactNode }) {
  return <CmsLayout>{children}</CmsLayout>;
}
