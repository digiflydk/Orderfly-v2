
// This file is now obsolete and the content has been moved to /docs/archive/public-root/layout.tsx
// It will be removed in a future step.
"use client";

import { useState } from 'react';
import { Footer } from "@/components/layout/footer";
import { CookieConsent } from '@/components/cookie-consent';
import type { Brand, GeneralSettings } from '@/types';
import type { WebsiteHeaderConfig } from '@/types/website';
import HeaderClient from '@/components/layout/HeaderClient';

export default function LegacyPublicLayout({
  children,
  brand,
  settings,
  headerConfig,
}: {
  children: React.ReactNode;
  brand: Brand;
  settings: GeneralSettings | null;
  headerConfig: WebsiteHeaderConfig;
}) {
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);

  const footerTheme = settings?.footer ?? {};
  const footerStyle: React.CSSProperties = {
    "--of-footer-bg": footerTheme.bgColor ?? "#0b0b0b",
    "--of-footer-text": footerTheme.textColor ?? "#e5e7eb",
    "--of-footer-link": footerTheme.linkColor ?? "#ffffff",
    "--of-footer-link-hover": footerTheme.linkHoverColor ?? "#d1d5db",
  } as React.CSSProperties;

  return (
    <div className="relative" style={footerStyle}>
      <HeaderClient brand={brand} settings={settings} config={headerConfig} />
      
      <main className="flex-1">{children}</main>

      {footerTheme.isVisible !== false && (
        <Footer
          brand={brand}
          version="1.0.223 • OF-523"
          onOpenCookieSettings={() => setIsCookieModalOpen(true)}
          theme={footerTheme}
        />
      )}
      <CookieConsent brandId={brand.id} isModalOpen={isCookieModalOpen} setIsModalOpen={setIsCookieModalOpen} />
    </div>
  );
}
