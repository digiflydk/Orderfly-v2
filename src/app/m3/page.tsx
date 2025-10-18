import { isM3Enabled } from "@/lib/feature-flags";
import { MobileHeader } from "./_components/MobileHeader";
import { MobileHero } from "./_components/MobileHero";
import { MobileCardGrid } from "./_components/MobileCardGrid";
import StickyOrderChoice from "./_components/StickyOrderChoice";
import { Hero } from "./_components/Hero";
import { CTADeck } from "./_components/CTADeck";
import { MenuGrid } from "./_components/MenuGrid";
import { PromoBanner } from "./_components/PromoBanner";
import { FooterCTA } from "./_components/FooterCTA";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export const runtime = "nodejs";

export default async function M3IndexPage() {
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

  return (
    <>
      <div className="md:hidden">
        <main className="bg-m3-cream min-h-dvh">
          <MobileHeader />
          <MobileHero />
          <div className="px-3 py-4">
            <MobileCardGrid />
          </div>
          <StickyOrderChoice />
        </main>
      </div>
      <div className="hidden md:block bg-m3-cream">
        <Header />
        <main>
          <Hero />
          <CTADeck />
          <MenuGrid />
          <PromoBanner />
          <FooterCTA />
        </main>
        <Footer />
      </div>
    </>
  );
}
