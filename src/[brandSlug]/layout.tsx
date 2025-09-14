import { notFound } from 'next/navigation';
import { getBrandBySlug } from '../superadmin/brands/actions';
import { CartProvider } from '@/context/cart-context';
import { AnalyticsProvider } from '@/context/analytics-context';

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { brandSlug: string };
}) {
  const brandSlug = params.brandSlug;
  const brand = await getBrandBySlug(brandSlug);

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
          {children}
        </div>
      </CartProvider>
    </AnalyticsProvider>
  );
}
