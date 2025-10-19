import { notFound } from 'next/navigation';
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { CartProvider } from '@/context/cart-context';
import { AnalyticsProvider } from '@/context/analytics-context';
import DeliveryMethodModal from '@/components/modals/DeliveryMethodModal';

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
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
        <DeliveryMethodModal />
      </CartProvider>
    </AnalyticsProvider>
  );
}
