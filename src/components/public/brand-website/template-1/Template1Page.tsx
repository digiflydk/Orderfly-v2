
'use client';

import { ReactNode } from "react";
import type { BrandWebsiteConfig, WebsiteHeaderConfig } from "@/types/website";
import { Header } from "./Header";
import M3Footer from "@/components/layout/M3Footer";
import StickyOrderChoice from "@/app/m3/_components/StickyOrderChoice"; // Assuming this is a generic CTA now

interface Template1PageProps {
  config: BrandWebsiteConfig;
  headerProps: {
    header: WebsiteHeaderConfig;
    ctaText: string;
    orderHref: string;
  };
  children: ReactNode;
}

export function Template1Page({ config, headerProps, children }: Template1PageProps) {
  
  const mainStyle: React.CSSProperties = {};
  if (config?.designSystem?.header?.sticky) {
    mainStyle.paddingTop = config.designSystem.header.height || '80px';
  }

  return (
    <div className="bg-m3-dark">
      <Header
        header={headerProps.header}
        ctaText={headerProps.ctaText}
        orderHref={headerProps.orderHref}
      />
      <main style={mainStyle}>
        {children}
      </main>
      <M3Footer />
      {config.designSystem.header?.sticky && (
        <div data-testid="template1-sticky-cta">
          <StickyOrderChoice onOrderClick={() => window.location.href = headerProps.orderHref} />
        </div>
      )}
    </div>
  );
}
