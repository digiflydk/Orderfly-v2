import '@/styles/storefront-v2-checkout.css';
import { headers } from 'next/headers';
import { isEsmeraldaV2Host } from '@/lib/esmeralda-v2-host';
import { StorefrontV2Provider } from '@/context/storefront-v2-context';

import { notFound } from 'next/navigation';
import { getBrandBySlug } from '@/lib/data/brand-location';
import { CartProvider } from '@/context/cart-context';
import { AnalyticsProvider } from '@/context/analytics-context';
import DeliveryModalHost from './deliverymodalhost';
import { resolveParams } from '@/lib/next/resolve-props';
import { BrandLayoutClient } from './layout-client';
import { isAdminReady } from '@/lib/runtime';
import { BrandTracking } from '@/components/brand-tracking';

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
  
  if (!brand) {
    notFound();
  }

  // A suspended brand shows a neutral status page on its subdomain and on
  // /{slug}, never its storefront, data or another brand (#12).
  if (brand.status === 'suspended') {
    return (
      <main data-brand-status="suspended" className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-2xl font-semibold">Siden er midlertidigt lukket</h1>
        <p className="text-muted-foreground">Online bestilling er ikke tilgængelig lige nu. Prøv igen senere.</p>
      </main>
    );
  }

  const requestHeaders = await headers();
  const v2 = brand.slug === 'esmeralda' && isEsmeraldaV2Host(requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'));

  return (
    <StorefrontV2Provider enabled={v2}>
      <AnalyticsProvider brand={brand}>
        <BrandTracking brand={brand} />
        <CartProvider>
          <div data-commerce-root data-brand-slug={brand.slug} data-storefront-version={v2 ? '2' : undefined}
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
            <BrandLayoutClient brand={brand}>
              {children}
            </BrandLayoutClient>
          </div>
          <DeliveryModalHost />
        </CartProvider>
      </AnalyticsProvider>
    </StorefrontV2Provider>
  );
}
