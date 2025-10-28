import Link from "next/link";
import { isM3Enabled } from "@/lib/feature-flags";
import { Button } from "@/components/ui/button";

import Header from "./_components/Header";
import { Hero } from "./_components/Hero";
import { CTADeck } from "./_components/CTADeck";
import { MenuGrid } from "./_components/MenuGrid";
import { PromoBanner } from "./_components/PromoBanner";
import { FooterCTA } from "./_components/FooterCTA";
import M3Footer from "@/components/layout/M3Footer";
import { MobileHeader } from "./_components/MobileHeader";
import { MobileHero } from "./_components/MobileHero";
import { MobileCardGrid } from "./_components/MobileCardGrid";
import StickyOrderChoice from "./_components/StickyOrderChoice";
import { OrderModal } from "./_components/OrderModal";

// This page is now a Server Component.
// All client-side logic for modals has been moved to the respective components.
export default function M3IndexPage() {
  if (!isM3Enabled()) {
    return (
      <main className="space-y-2 p-6 text-center">
        <h1 className="text-2xl font-semibold text-red-600">M3 disabled</h1>
        <p>
          Set <code>NEXT_PUBLIC_M3_PREVIEW=true</code> in <code>.env.local</code> to
          activate the preview.
        </p>
      </main>
    );
  }

  // The onOrderClick prop is now passed to the client-side Header.
  // The OrderModal is now handled within its own component or a layout component.
  return (
    <>
      {/* Mobile View */}
      <div className="md:hidden">
        <main className="bg-m3-cream min-h-dvh">
          <MobileHeader />
          <MobileHero />
          <div className="px-3 py-4">
            <MobileCardGrid />
          </div>
          <StickyOrderChoice onOrderClick={() => {
            // Placeholder for future client-side navigation logic if needed from a server component
            // For now, this can be static or handled differently.
          }} />
        </main>
      </div>
      
      {/* Desktop View */}
      <div className="hidden md:block bg-m3-cream">
        <Header onOrderClick={() => {
            // The actual modal opening logic is in Header.tsx, this is a placeholder
        }}/>
        <main>
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold">M3 (Preview)</h1>
            <p>Dette er en placeholder for M3-frontend.</p>
             <div className="mt-4">
              <p className="mb-2">Eksempel-route:</p>
              <Button asChild>
                <Link
                  href="/m3pizza/m3-pizza-hellerup"
                >
                  Åbn Esmeralda – Amager (mock)
                </Link>
              </Button>
            </div>
          </div>
          <Hero onOrderClick={() => {
             // The actual modal opening logic is in Hero.tsx, this is a placeholder
          }}/>
          <CTADeck />
          <MenuGrid />
          <PromoBanner />
          <FooterCTA />
        </main>
        <M3Footer />
      </div>
    </>
  );
}
