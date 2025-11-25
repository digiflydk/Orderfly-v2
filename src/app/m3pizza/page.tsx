'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isM3Enabled } from "@/lib/feature-flags";
import Header from "./_components/Header";
import { Hero } from "./_components/Hero";
import { CTADeck } from "./_components/CTADeck";
import { MenuGrid } from "./_components/MenuGrid";
import { PromoBanner } from "./_components/PromoBanner";
import { FooterCTA } from "./_components/FooterCTA";
import M3Footer from "@/components/layout/M3Footer";
import { OrderModal } from './_components/OrderModal';
import { Button } from '@/components/ui/button';
import { MobileHeader } from './_components/MobileHeader';
import { MobileHero } from './_components/MobileHero';
import { MobileCardGrid } from './_components/MobileCardGrid';
import StickyOrderChoice from './_components/StickyOrderChoice';

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

  const handleOrderClick = () => {
    router.push("/m3pizza/order");
  };
  
  const handleDeliveryMethodSelected = (method: 'takeaway' | 'delivery') => {
    console.log(`Selected delivery method: ${method}`);
    // Example navigation: router.push('/m3pizza/esmeralda-pizza-amager?deliveryMethod=' + method);
  };
  
  const headerNavItems = [
    { label: "Menu", href: "#menu" },
    { label: "Om os", href: "#about" },
    { label: "Kontakt", href: "#contact" },
  ];

  const headerProps = {
    logoUrl: "/m3pizza-logo.svg",
    navItems: headerNavItems,
    orderHref: "/m3pizza/order",
    onOrderClick: handleOrderClick,
  };

  return (
    <>
      {/* Mobile View */}
      <div className="md:hidden">
        <main className="bg-m3-dark min-h-dvh">
          <MobileHeader />
          <MobileHero onOrderClick={handleOrderClick} />
          <div className="px-3 py-4">
            <MobileCardGrid />
          </div>
          <StickyOrderChoice onOrderClick={handleOrderClick} />
        </main>
      </div>
      
      {/* Desktop View */}
      <div className="hidden md:block bg-m3-dark">
        <Header {...headerProps} />
        <main>
          <Hero onOrderClick={handleOrderClick} />
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
