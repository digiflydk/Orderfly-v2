import { notFound } from 'next/navigation';
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { AnalyticsProvider } from '@/context/analytics-context';
import React from 'react';
import { getGeneralSettings } from '@/services/settings';
import type { Location } from '@/types';
import { getLocationBySlug } from '../superadmin/locations/actions';
import DeliveryModalHost from './deliverymodalhost';
import { BrandLayoutClient } from './layout-client';
import { CartProvider } from '@/context/cart-context';

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { brandSlug: string; locationSlug?: string };
}) {
  const { brandSlug, locationSlug } = params;

  const [brand, settings] = await Promise.all([
    getBrandBySlug(brandSlug),
    getGeneralSettings(),
  ]);

  if (!brand) {
    notFound();
  }

  // Location is optional at this level. Location-specific layouts will handle their own fetching.
  const location: Location | null = locationSlug
    ? await getLocationBySlug(brand.id, locationSlug)
    : null;

  const brandThemeStyle: React.CSSProperties = {
    '--primary': brand.appearances?.colors.primary,
    '--secondary': brand.appearances?.colors.secondary,
    '--background': brand.appearances?.colors.background,
    '--foreground': brand.appearances?.colors.text,
    '--border': brand.appearances?.colors.border,
    '--primary-foreground': brand.appearances?.colors.buttonText,
    fontFamily: brand.appearances?.typography.fontFamily,
  } as React.CSSProperties;

  const footerTheme = settings?.footer ?? {};

  const footerStyle: React.CSSProperties = {
    '--of-footer-bg': footerTheme.bgColor ?? '#0b0b0b',
    '--of-footer-text': footerTheme.textColor ?? '#e5e7eb',
    '--of-footer-link': footerTheme.linkColor ?? '#ffffff',
    '--of-footer-link-hover': footerTheme.linkHoverColor ?? '#d1d5db',
  } as React.CSSProperties;

  return (
    <AnalyticsProvider>
      <CartProvider>
        <div
          className="brand-theme"
          style={{ ...brandThemeStyle, ...footerStyle }}
        >
          <BrandLayoutClient brand={brand} location={location} settings={settings}>
            {children}
          </BrandLayoutClient>
          <DeliveryModalHost />
        </div>
      </CartProvider>
    </AnalyticsProvider>
  );
}
