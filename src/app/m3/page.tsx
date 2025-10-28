'use client';
import { useState } from 'react';
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
import Header from "./_components/Header";
import M3Footer from "@/components/layout/M3Footer";
import { OrderModal } from './_components/OrderModal';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function M3IndexPage() {
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const router = useRouter();

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

  const handleNavigateToMenu = () => {
    // Corrected to use router for client-side navigation
    router.push('/m3/esmeralda/esmeralda-pizza-amager');
  };
  
  const handleDeliveryMethodSelected = (method: 'takeaway' | 'delivery') => {
    console.log(`Selected delivery method: ${method}`);
    // Example navigation: router.push('/m3/esmeralda/esmeralda-pizza-amager?deliveryMethod=' + method);
  };

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
          <StickyOrderChoice onOrderClick={handleNavigateToMenu} />
        </main>
      </div>
      
      {/* Desktop View */}
      <div className="hidden md:block bg-m3-cream">
        <Header onOrderClick={() => setOrderModalOpen(true)}/>
        <main>
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold">M3 (Preview)</h1>
            <p>Dette er en placeholder for M3-frontend.</p>
             <div className="mt-4">
              <p className="mb-2">Eksempel-route:</p>
              <Button asChild>
                <Link
                  href="/m3/esmeralda/esmeralda-pizza-amager"
                >
                  Åbn Esmeralda – Amager (mock)
                </Link>
              </Button>
            </div>
          </div>
          <Hero onOrderClick={() => setOrderModalOpen(true)} />
          <CTADeck />
          <MenuGrid />
          <PromoBanner />
          <FooterCTA />
        </main>
        <M3Footer />
      </div>

      <OrderModal 
        open={orderModalOpen}
        onOpenChange={setOrderModalOpen}
        onDeliveryMethodSelected={handleDeliveryMethodSelected}
      />
    </>
  );
}
