'use client';

import { usePathname } from 'next/navigation';
import type { Brand, Location } from '@/types';
import { useState } from 'react';
import { MenuHeader } from '@/components/layout/menu-header';
import { CookieConsent } from '@/components/cookie-consent';
import { CartProvider } from '@/context/cart-context';
import DeliveryMethodModal from '@/components/modals/DeliveryMethodModal';

// Matcher dine faktiske filnavne (lowercase)
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

export function BrandLayoutClient({
  children,
  brand,
  location,
}: {
  children: React.ReactNode;
  brand?: Brand | null;
  location?: Location | null;
}) {
  const pathname = usePathname();
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);

  const isCheckoutPage = pathname?.includes('/checkout');
  const isMenuPage = !!location && !isCheckoutPage;
  const isBrandHomePage = !location;

  const showGlobalHeader = !isMenuPage;
  const showMenuHeader = isMenuPage;

  const isConfirmationPage = pathname?.includes('/checkout/confirmation');
  const showFooter = isBrandHomePage || isMenuPage || isConfirmationPage;

  return (
    <CartProvider>
      <div className="flex flex-col min-h-screen">
        {showGlobalHeader && brand && <Header brand={brand} />}
        {showMenuHeader && location && brand && <MenuHeader brand={brand} />}
        <main className="flex-1 w-full">
          {children}
        </main>
        {showFooter && (
          <Footer
            brand={brand ?? undefined}
            location={location ?? undefined}
            version="Version 1.0.96 • OF-403"
            onOpenCookieSettings={() => setIsCookieModalOpen(true)}
          />
        )}
        <CookieConsent
          brandId={brand?.id ?? "default-brand"}
          isModalOpen={isCookieModalOpen}
          setIsModalOpen={setIsCookieModalOpen}
        />
        <DeliveryMethodModal />
      </div>
    </CartProvider>
  );
}
