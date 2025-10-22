
'use client';

import { usePathname } from 'next/navigation';
import type { Brand, Location, GeneralSettings } from '@/types';
import { CookieConsent } from '@/components/cookie-consent';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCart } from '@/context/cart-context';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { MenuHeader } from '@/components/layout/menu-header';

export function BrandLayoutClient({
  children,
  brand,
  location,
  settings,
}: {
  children: React.ReactNode;
  brand: Brand | null;
  location?: Location | null;
  settings?: GeneralSettings | null;
}) {
  const pathname = usePathname();
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
  
  if (!brand) {
    return (
        <div className="flex flex-col min-h-screen items-center justify-center">
            <p>Loading brand information...</p>
        </div>
    );
  }
  
  const isLocationPage = !!location;
  const isBrandHomePage = !location;

  const showGlobalHeader = isBrandHomePage;
  const showMenuHeader = isLocationPage;
  
  const isConfirmationPage = pathname?.includes('/checkout/confirmation');
  const showFooter = isBrandHomePage || isLocationPage || isConfirmationPage;

  return (
      <div
        className="flex flex-col min-h-screen"
      >
        {showGlobalHeader && <Header brand={brand} settings={settings || null} />}
        {showMenuHeader && location && <MenuHeader brand={brand} />}
        <main className="flex-1 w-full">
            {children}
        </main>
        {showFooter && (
          <Footer 
            brand={brand} 
            location={location ?? undefined} 
            version="1.0.223 • OF-523"
            onOpenCookieSettings={() => setIsCookieModalOpen(true)} 
          />
        )}
        <CookieConsent brandId={brand.id} isModalOpen={isCookieModalOpen} setIsModalOpen={setIsCookieModalOpen} />
      </div>
  );
}
