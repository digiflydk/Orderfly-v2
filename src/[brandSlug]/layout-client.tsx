
'use client';

import { usePathname } from 'next/navigation';
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import type { Brand, Location } from "@/types";
import { CookieConsent } from '@/components/cookie-consent';
import { useState } from 'react';
import { MenuHeader } from '@/components/layout/menu-header';

export function BrandLayoutClient({
  children,
  brand,
  location,
}: {
  children: React.ReactNode;
  brand: Brand | null;
  location?: Location | null;
}) {
  const pathname = usePathname();
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
  
  // If brand is null, we can't render anything meaningful.
  // This could be a loading state or a minimal error display.
  if (!brand) {
    // A simple loading or error state for when brand data is not yet available.
    // This prevents the app from crashing.
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
      {showGlobalHeader && <Header brand={brand} />}
      {showMenuHeader && <MenuHeader brand={brand} />}
      <main className="flex-1 w-full">
          {children}
      </main>
      {showFooter && (
        <Footer 
          brand={brand} 
          location={location ?? undefined} 
          version="Version 1.0.95 • OF-273" 
          onOpenCookieSettings={() => setIsCookieModalOpen(true)} 
        />
      )}
      <CookieConsent brandId={brand.id} isModalOpen={isCookieModalOpen} setIsModalOpen={setIsCookieModalOpen} />
    </div>
  );
}
