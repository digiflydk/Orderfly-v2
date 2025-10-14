import type { ReactNode } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export default function M3Layout({ children }: { children: ReactNode }) {
  // Main layout wrapper for the M3 section.
  return (
    <div className="min-h-screen bg-[#FFF8F0] text-[#2D2D2D]">
      {/* Header would go here if it were part of this layout */}
      <main>{children}</main>
      {/* The global Footer is rendered in the root layout */}
    </div>
  );
}
