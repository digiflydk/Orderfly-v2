'use client';
import type { StorefrontLinks } from '@/lib/storefront-types';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Brand, Location, ProductForMenu, StandardDiscount } from '@/types';
import { Hero } from '@/components/storefront/Hero';
import { CTADeck } from '@/components/storefront/CTADeck';
import { MenuGrid } from '@/components/storefront/MenuGrid';
import { PromoBanner } from '@/components/storefront/PromoBanner';
import { FooterCTA } from '@/components/storefront/FooterCTA';
import { StandardStorefront } from '@/components/storefront/StandardStorefront';
import StickyOrderChoice from '@/components/storefront/StickyOrderChoice';
import { normalizeM3PizzaDeliveryMethod, persistM3PizzaDeliveryMethod } from '@/lib/m3pizza-order-flow';
import { promotionTile } from '@/lib/storefront-promotion';
import { comboEligible } from '@/lib/combo-eligibility';
import { AnalyticsProvider } from '@/context/analytics-context';
import { CookieConsent } from '@/components/cookie-consent';
import { OrderModal } from '@/components/storefront/OrderModal';

export default function LandingClient({brand, location, products, discounts, config}: {
  brand: Brand; location: Location; products: ProductForMenu[]; discounts: StandardDiscount[]; config: StorefrontLinks | null;
}) {
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [cookieModalOpen, setCookieModalOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const router = useRouter();
  useEffect(() => { const tick = () => setNow(new Date()); const timer = setInterval(tick, 30000); window.addEventListener('focus', tick);
    return () => {clearInterval(timer); window.removeEventListener('focus', tick);}; }, []);
  const promotions = useMemo(() => discounts.filter(d => comboEligible(d, {brandId: brand.id, locationId: location.id, now}))
    .filter(d => d.orderTypes.some(type => location.deliveryTypes.includes(type))).map(d => promotionTile({...d, orderTypes: d.orderTypes.filter(mode => location.deliveryTypes.includes(mode))})), [discounts, now, brand.id, location]);
  const order = () => setOrderModalOpen(true);
  const choose = (method: 'takeaway' | 'delivery') => {
    const mode = normalizeM3PizzaDeliveryMethod(method);
    persistM3PizzaDeliveryMethod(mode);
    router.push(`/${brand.slug}/${location.slug}?deliveryMethod=${mode}`);
  };
  return <AnalyticsProvider brand={brand}>
    <StandardStorefront brand={brand} onOrderClick={order} config={config} onCookieSettings={() => setCookieModalOpen(true)}>
      <Hero onOrderClick={order} brandName={brand.name} products={products} />
      <CTADeck promotions={promotions.slice(0, 2)} onOrderClick={order} />
      <MenuGrid products={products} modes={location.deliveryTypes} onOrderClick={order} />
      <PromoBanner promotion={promotions[2]} onOrderClick={order} />
      <FooterCTA brandName={brand.name} onOrderClick={order} />
      <div className="md:hidden"><StickyOrderChoice onOrderClick={order} /></div>
      {orderModalOpen && <OrderModal open onOpenChange={setOrderModalOpen} onDeliveryMethodSelected={choose} modes={location.deliveryTypes} />}
    </StandardStorefront>
    <CookieConsent brandId={brand.id} isModalOpen={cookieModalOpen} setIsModalOpen={setCookieModalOpen} />
  </AnalyticsProvider>;
}
