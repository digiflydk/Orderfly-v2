import type { ReactNode } from "react";

export default function M3Layout({ children }: { children: ReactNode }) {
  // Main layout wrapper for the M3 section.
  // The header/footer are handled by the root layout.
  return <div className="bg-background text-foreground">{children}</div>;
}
