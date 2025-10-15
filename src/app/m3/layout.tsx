import type { ReactNode } from "react";
import { Footer } from "@/components/layout/footer";

export default function M3Layout({ children }: { children: React.ReactNode }) {
  // Main layout wrapper for the M3 section.
  return (
    <div className="min-h-screen bg-[#FFF8F0] text-[#2D2D2D]">
      <main>{children}</main>
      <Footer version="1.0.217 • OF-382" />
    </div>
  );
}
