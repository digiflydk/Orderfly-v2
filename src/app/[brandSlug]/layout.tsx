
import { notFound } from 'next/navigation';
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { CartProvider } from '@/context/cart-context';
import { AnalyticsProvider } from '@/context/analytics-context';
import DeliveryModalHost from './deliverymodalhost';
import { resolveParams } from '@/lib/next/resolve-props';
import { BrandLayoutClient } from './layout-client';
import { getGeneralSettings } from '@/services/settings';
import { isAdminReady } from '@/lib/runtime';

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await resolveParams(params);
  
  if (!isAdminReady()) {
    return (
      <div className="bg-amber-100 text-amber-900 text-sm px-3 py-2 text-center">
        Running in limited mode (no Admin credentials). Public pages are available; Superadmin requires configuration.
      </div>
    );
  }
  
  // Fetch data on the server. The client component will handle nulls gracefully.
  const brand = await getBrandBySlug(brandSlug);
  const settings = await getGeneralSettings();
  
  if (!brand) {
    notFound();
  }

  return (
    <AnalyticsProvider brand={brand}>
      <CartProvider>
        <div
          style={
            {
              '--primary': brand.appearances?.colors.primary,
              '--secondary': brand.appearances?.colors.secondary,
              '--background': brand.appearances?.colors.background,
              '--foreground': brand.appearances?.colors.text,
              '--border': brand.appearances?.colors.border,
              '--primary-foreground': brand.appearances?.colors.buttonText,
              fontFamily: brand.appearances?.typography.fontFamily,
            } as React.CSSProperties
          }
        >
          <BrandLayoutClient brand={brand} settings={settings}>
            {children}
          </BrandLayoutClient>
        </div>
        <DeliveryModalHost />
      </CartProvider>
    </AnalyticsProvider>
  );
}
