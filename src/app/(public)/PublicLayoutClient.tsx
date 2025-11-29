
'use client';

import { useState } from 'react';
import { Footer } from "@/components/layout/footer";
import { CookieConsent } from '@/components/cookie-consent';
import type { Brand } from '@/types';
import type { WebsiteHeaderConfig } from '@/types/website';

export function PublicLayoutClient({
  children,
  brand,
  settings,
  headerConfig
}: {
  children: React.ReactNode;
  brand: Brand;
  settings: any | null;
  headerConfig: WebsiteHeaderConfig;
}) {
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen">
      {children}
      <Footer 
        brand={brand} 
        version="1.0.265 • 522-11-149"
        onOpenCookieSettings={() => setIsCookieModalOpen(true)}
      />
      <CookieConsent brandId={brand.id} isModalOpen={isCookieModalOpen} setIsModalOpen={setIsCookieModalOpen} />
    </div>
  );
}
