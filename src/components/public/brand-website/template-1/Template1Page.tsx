
'use client';

import { Suspense } from 'react';
import type { WebsiteHeaderConfig, BrandWebsiteHome } from '@/lib/types/brandWebsite';
import { Header } from '@/components/public/brand-website/template-1/Header';
import M3Footer from '@/components/layout/M3Footer';
import StickyOrderChoice from '@/app/m3/_components/StickyOrderChoice'; // Assuming this is the correct path

export interface Template1PageProps {
  children: React.ReactNode;
  headerProps?: {
    header: WebsiteHeaderConfig;
    ctaText: string;
    orderHref: string;
  };
  homeProps?: BrandWebsiteHome;
}

export function Template1Page({ children, headerProps = { header: {}, ctaText: '', orderHref: '' } as any }: Template1PageProps) {
  return (
    <div className="bg-m3-dark">
      <Header
        header={headerProps.header}
        ctaText={headerProps.ctaText}
        orderHref={headerProps.orderHref}
      />
      <main>{children}</main>
      <M3Footer />
      {/* Sticky CTA for mobile */}
      <div className="md:hidden" data-testid="template1-sticky-cta">
        <StickyOrderChoice onOrderClick={() => {
            if (headerProps.orderHref) {
                window.location.href = headerProps.orderHref;
            }
        }} />
      </div>
    </div>
  );
}
