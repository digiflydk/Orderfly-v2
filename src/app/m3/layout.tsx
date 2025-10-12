import type { ReactNode } from "react";
export const runtime = "nodejs";
export default function M3Layout({ children }: { children: ReactNode }) {
  return <div className="p-8 max-w-3xl mx-auto">{children}</div>;
}
