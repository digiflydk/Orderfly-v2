'use client';
import { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/components/product/product-card';
import { useCart } from '@/context/cart-context';
import { useAnalytics } from '@/context/analytics-context';
import { useStorefrontV2 } from '@/context/storefront-v2-context';
import type { StorefrontUpsell } from '@/context/storefront-catalog';
import { discountedUnit, money } from '@/lib/money';

/** Offers open before the basket. ProductCard retains native required choices and pricing. */
export function UpsellDialog({ upsellData, onContinue }: {upsellData: StorefrontUpsell; onContinue: () => void}) {
  const {deliveryType, standardDiscounts, location} = useCart();
  const {trackEvent, measurementKey} = useAnalytics();
  const isV2 = useStorefrontV2();
  const handled = useRef(false), shown = useRef(false);
  const interactionId = useRef(crypto.randomUUID());
  const {upsell, products} = upsellData;
  useEffect(() => {
    if (!shown.current && trackEvent('upsell_offer_shown', {upsellId:upsell.id, interactionId:interactionId.current, locationId:location?.id})) shown.current = true;
  }, [upsell.id, location?.id, measurementKey, trackEvent]);
  const finish = (accepted: boolean) => {
    if (handled.current) return;
    handled.current = true;
    if (!accepted) trackEvent('upsell_rejected', {upsellId:upsell.id, interactionId:interactionId.current, locationId:location?.id});
    onContinue();
  };
  return <Dialog open onOpenChange={open => {if (!open) finish(false);}}>
    <DialogContent data-storefront-version={isV2 ? '2' : undefined} data-commerce-panel="upsell" className="w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto flex flex-col gap-4 p-5 sm:p-6">
      <DialogHeader className="pr-8">
        <DialogTitle>{upsell.upsellName || 'Lidt ekstra til din ordre'}</DialogTitle>
        <DialogDescription>{upsell.description || 'Vil du have lidt ekstra med, inden du går til kurven?'}</DialogDescription>
      </DialogHeader>
      <div aria-label="Tilbud til din ordre">
        {products.map(product => {
          const basePrice = money(deliveryType === 'delivery' ? product.priceDelivery ?? product.price : product.price);
          const price = discountedUnit(basePrice, upsell.discountType, upsell.discountValue);
          return <ProductCard key={product.id} product={{...product, price, basePrice} as typeof product} activeDiscounts={standardDiscounts}
            upsellId={upsell.id} upsellInteractionId={interactionId.current} onProductAdded={() => finish(true)} compact />;
        })}
      </div>
      <Button variant="outline" className="min-h-12 w-full" onClick={() => finish(false)}>Fortsæt til kurven</Button>
    </DialogContent>
  </Dialog>;
}
