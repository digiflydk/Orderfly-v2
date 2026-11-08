'use client';
import { upsellBadgeLabels } from '@/lib/upsell-badges';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/components/product/product-card';
import { useCart } from '@/context/cart-context';
import { useAnalytics } from '@/context/analytics-context';
import { useStorefrontV2 } from '@/context/storefront-v2-context';
import type { StorefrontUpsell } from '@/context/storefront-catalog';
import { discountedUnit, money } from '@/lib/money';

/** Offers precede the mobile basket or desktop checkout; native choices and pricing remain intact. */
export function UpsellDialog({ upsellData, onContinue, destination = 'cart' }: {upsellData: StorefrontUpsell; destination?: 'cart' | 'checkout'; onContinue: (accepted: boolean, productId?: string) => void}) {
  const {deliveryType, standardDiscounts, location} = useCart();
  const {trackEvent, measurementKey} = useAnalytics();
  const isV2 = useStorefrontV2();
  const handled = useRef(false), shown = useRef(false);
  const interactionId = useRef(crypto.randomUUID());
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const seenProducts = useRef(new Set<string>());
  const {upsell, products} = upsellData;
  useEffect(() => {
    if (!shown.current && trackEvent('upsell_offer_shown', {upsellId:upsell.id, upsellStep:upsellData.step || 1, interactionId:interactionId.current, locationId:location?.id})) {
      shown.current = true;

    }
  }, [upsell.id, location?.id, measurementKey, trackEvent]);
  useEffect(() => {
    const root = list;
    if (!root) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.upsellProduct;
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5 || !id || seenProducts.current.has(id)) continue;
        if (trackEvent('upsell_product_shown', {
          upsellId: upsell.id, productId: id, upsellStep: upsellData.step || 1,
          interactionId: interactionId.current, locationId: location?.id,
          badge: upsellData.badges?.[id] || 'none', badgeSource: upsellData.badgeSources?.[id] || 'none',
        })) seenProducts.current.add(id);
      }
    }, {root, threshold: 0.5});
    root.querySelectorAll('[data-upsell-product]').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [list, measurementKey, trackEvent, upsellData, upsell.id, location?.id]);
  const finish = (accepted: boolean, productId?: string) => {
    if (handled.current) return;
    handled.current = true;
    if (!accepted) trackEvent('upsell_rejected', {upsellId:upsell.id, interactionId:interactionId.current, locationId:location?.id});
    onContinue(accepted, productId);
  };
  return <Dialog open onOpenChange={open => {if (!open) finish(false);}}>
    <DialogContent data-storefront-version={isV2 ? '2' : undefined} data-commerce-panel="upsell" className="w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-hidden flex flex-col gap-4 p-5 sm:p-6">
      <DialogHeader className="pr-8">
        <DialogTitle>{upsell.displayHeading || upsell.upsellName || 'Lidt ekstra til din ordre'}</DialogTitle>
        <DialogDescription>{upsell.description || (destination === 'checkout' ? 'Vil du have lidt ekstra med, inden du går til checkout?' : 'Vil du have lidt ekstra med, inden du går til kurven?')}</DialogDescription>
      </DialogHeader>
      <div ref={setList} aria-label="Tilbud til din ordre" className="min-h-0 overflow-y-auto">
        {products.map(product => {
          const basePrice = money(deliveryType === 'delivery' ? product.priceDelivery ?? product.price : product.price);
          const price = discountedUnit(basePrice, upsell.discountType, upsell.discountValue);
          return <div key={product.id} data-upsell-product={product.id}><ProductCard badgeOverride={upsellBadgeLabels[upsellData.badges?.[product.id] || 'none'] || null} product={{...product, price, basePrice} as typeof product} activeDiscounts={standardDiscounts}
            upsellId={upsell.id} upsellInteractionId={interactionId.current} onProductAdded={directAdd => finish(true, directAdd ? product.id : undefined)} compact /></div>;
        })}
      </div>
      <Button variant="outline" className="min-h-12 w-full shrink-0" onClick={() => finish(false)}>{destination === 'checkout' ? 'Fortsæt til checkout' : 'Fortsæt til kurven'}</Button>
    </DialogContent>
  </Dialog>;
}
