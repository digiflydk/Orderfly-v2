'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isM3Enabled } from "@/lib/feature-flags";
import { Header, type Template1HeaderProps } from "@/components/public/brand-website/template-1/Header";
import { Hero } from "./_components/Hero";
import { CTADeck } from "./_components/CTADeck";
import { MenuGrid } from "./_components/MenuGrid";
import { PromoBanner } from "./_components/PromoBanner";
import { FooterCTA } from "./_components/FooterCTA";
import M3Footer from "@/components/layout/M3Footer";
import { OrderModal } from './_components/OrderModal';
import { Button } from '@/components/ui/button';
import { MobileHero } from './_components/MobileHero';
import { MobileCardGrid } from './_components/MobileCardGrid';

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
  
  const handleDeliveryMethodSelected = (method: 'takeaway' | 'delivery') => {
    console.log(`Selected delivery method: ${method}`);
    router.push(`/m3pizza/order?deliveryMethod=${method}`);
  };
  
  const headerNavItems = [
    { label: "Menu", href: "#menu" },
    { label: "Om os", href: "#about" },
    { label: "Kontakt", href: "#contact" },
  ];

  const headerProps: Template1HeaderProps = {
    logoUrl: "/m3pizza-logo.svg",
    navItems: headerNavItems,
    orderHref: "/m3pizza/order",
  };

  return (
    <>
      <Header {...headerProps} />
      <main className="bg-m3-dark">
        <Hero onOrderClick={() => setOrderModalOpen(true)} />
        <CTADeck />
        <MenuGrid />
        <PromoBanner />
        <FooterCTA />
      </main>
      <M3Footer />

      <OrderModal 
        open={orderModalOpen}
        onOpenChange={setOrderModalOpen}
        onDeliveryMethodSelected={handleDeliveryMethodSelected}
      />
    </>
  );
}
