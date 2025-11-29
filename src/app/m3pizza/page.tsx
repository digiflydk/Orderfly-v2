
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isM3Enabled } from "@/lib/feature-flags";
import { Hero } from "./_components/Hero";
import { CTADeck } from "./_components/CTADeck";
import { MenuGrid } from "./_components/MenuGrid";
import { PromoBanner } from "./_components/PromoBanner";
import { FooterCTA } from "./_components/FooterCTA";
import M3Footer from "@/components/layout/M3Footer";
import { OrderModal } from './_components/OrderModal';
import { Button } from '@/components/ui/button';
import { Template1Page } from '@/components/public/brand-website/template-1/Template1Page';
import { getPublicBrandWebsiteConfig } from '@/lib/public/brand-website/public-config-api';
import StickyOrderChoice from '@/app/m3/_components/StickyOrderChoice';

export default function M3IndexPage() {
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [config, setConfig] = useState<any | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchConfig() {
        try {
            const result = await getPublicBrandWebsiteConfig('m3pizza');
            setConfig(result);
        } catch (error) {
            console.error("Failed to fetch M3Pizza config:", error);
        }
    }
    fetchConfig();
  }, []);

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
    router.push(`/m3pizza/order?deliveryMethod=${method}`);
  };

  if (!config) {
      return <div>Loading...</div>;
  }
  
  return (
    <Template1Page>
      <main className="bg-m3-dark">
        <Hero onOrderClick={() => setOrderModalOpen(true)} />
        <CTADeck />
        <MenuGrid />
        <PromoBanner />
        <FooterCTA />
      </main>
      <M3Footer />
      
      <div className="md:hidden">
        <StickyOrderChoice onOrderClick={() => setOrderModalOpen(true)} />
      </div>

      <OrderModal
        open={orderModalOpen}
        onOpenChange={setOrderModalOpen}
        onDeliveryMethodSelected={handleDeliveryMethodSelected}
      />
    </Template1Page>
  );
}
