import type { ReactNode } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function M3Layout({ children }: { children: ReactNode }) {
  // Main layout wrapper for the M3 section.
  return (
    <div className="min-h-screen bg-m3-gray text-m3-dark">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
