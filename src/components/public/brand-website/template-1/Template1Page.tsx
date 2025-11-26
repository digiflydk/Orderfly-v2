
'use client';
import type { ReactNode } from 'react';
import type { BrandWebsiteConfig, WebsiteHeaderConfig } from '@/lib/types/brandWebsite';
import { Header } from '@/components/public/brand-website/template-1/Header';
import M3Footer from '@/components/layout/M3Footer';
import StickyOrderChoice from '@/app/m3/_components/StickyOrderChoice';

export interface Template1PageProps {
  websiteConfig: BrandWebsiteConfig;
  header: WebsiteHeaderConfig;
  onOrderClick: () => void;
  children: ReactNode;
}

export function Template1Page({ websiteConfig, header, children, onOrderClick }: Template1PageProps) {
  const theme = websiteConfig.designSystem;
  const style = {
    '--bg-color': theme?.colors?.background || '#FFFFFF',
    '--text-color': theme?.colors?.textPrimary || '#111111',
    '--primary-color': theme?.colors?.primary || '#FFBD02',
    '--primary-text-color': theme?.buttons?.primaryVariant?.text || '#000000',
    '--secondary-color': theme?.colors?.secondary || '#333333',
    '--secondary-text-color': theme?.buttons?.secondaryVariant?.text || '#FFFFFF',
    '--heading-font': theme?.typography?.headingFont || 'inherit',
    '--body-font': theme?.typography?.bodyFont || 'inherit',
    '--btn-radius': theme?.buttons?.borderRadius || '9999px',
    '--btn-px': theme?.buttons?.paddingX || '1.25rem',
    '--btn-py': theme?.buttons?.paddingY || '0.75rem',
    '--btn-font-weight': theme?.buttons?.fontWeight || '600',
    '--btn-uppercase': theme?.buttons?.uppercase ? 'uppercase' : 'none',
  } as React.CSSProperties;

  return (
    <div style={style} className="font-body bg-bg-color text-text-color">
      <Header
        config={header}
        logoUrl={websiteConfig.logoUrl}
        logoAlt={websiteConfig.seo?.defaultTitle ?? 'Brand Logo'}
        navLinks={websiteConfig.headerNavLinks}
        onOrderClick={onOrderClick}
      />
      <main>{children}</main>
      <M3Footer />
      <div className="md:hidden" data-testid="template1-sticky-cta">
        <StickyOrderChoice onOrderClick={onOrderClick} />
      </div>
    </div>
  );
}
