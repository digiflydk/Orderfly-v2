
'use client';

import { usePathname } from 'next/navigation';
import type { Brand, Location, GeneralSettings } from '@/types';
import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { MenuHeader } from '@/components/layout/menu-header';
import { CookieConsent } from '@/components/cookie-consent';
import { CartProvider } from '@/context/cart-context';
import DeliveryModalHost from './deliverymodalhost';

export function BrandLayoutClient({
  children,
  brand,
  location,
  settings
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

  const isCheckoutPage = pathname?.includes('/checkout');
  const isMenuPage = !!location && !isCheckoutPage;
  const isBrandHomePage = !location;

  const showGlobalHeader = isBrandHomePage || isCheckoutPage;
  const showMenuHeader = isMenuPage;

  const isConfirmationPage = pathname?.includes('/checkout/confirmation');
  const showFooter = isBrandHomePage || isMenuPage || isConfirmationPage;

  return (
      <div className="flex flex-col min-h-screen">
        {showGlobalHeader && <Header brand={brand} settings={settings} />}
        {showMenuHeader && <MenuHeader brand={brand} />}
        <main className="flex-1 w-full">
          {children}
        </main>
        {showFooter && (
          <Footer
            brand={brand}
            location={location ?? undefined}
            version="1.0.504 • OF-504"
            onOpenCookieSettings={() => setIsCookieModalOpen(true)}
          />
        )}
        <CookieConsent
          brandId={brand.id}
          isModalOpen={isCookieModalOpen}
          setIsModalOpen={setIsCookieModalOpen}
        />
      </div>
  );
}
