
'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { WebsiteHeaderConfig, BrandWebsiteConfig } from '@/types/website';
import { Header } from './Header';
import { Template1Head } from './Template1Head';
import { ThemeProvider } from './ThemeProvider';
import { usePathname } from 'next/navigation';
import M3Footer from '@/components/layout/M3Footer';

interface Template1PageProps {
  config: BrandWebsiteConfig;
  children: ReactNode;
}

export function Template1Page({ config, children }: Template1PageProps) {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const headerConfig = {
    logoUrl: config.logoUrl,
    logoAlt: 'Brand Logo',
    navItems: config.headerNavLinks || [],
    orderHref: '#',
    ctaLabel: 'Order Now',
    config, // Pass the full config
  };

  return (
    <>
      <Template1Head
        title={config.seo?.defaultTitle || 'My Brand'}
        description={config.seo?.defaultDescription || ''}
        faviconUrl={config.faviconUrl || '/favicon.ico'}
        ogImageUrl={config.seo?.ogImageUrl}
        canonicalUrl={config.seo?.canonicalUrl}
        robotsNoIndex={!config.seo?.index}
      />
      <ThemeProvider designSystem={config.designSystem}>
        <div 
          className="min-h-screen"
          style={{ backgroundColor: 'var(--template1-color-background)' }}
        >
          {isClient && <Header {...headerConfig} />}
          <main>{children}</main>
          {pathname.startsWith('/m3pizza') && <M3Footer />}
        </div>
      </ThemeProvider>
    </>
  );
}
