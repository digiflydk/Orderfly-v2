import type { ReactNode } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function M3Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-m3-cream text-m3-dark">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
