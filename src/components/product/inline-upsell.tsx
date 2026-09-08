'use client';
import { useEffect, useRef, useState } from 'react';
import { useAnalytics } from '@/context/analytics-context';
import { markUpsellHandled } from '@/lib/handled-upsells';
import { Button } from '@/components/ui/button';
import { useStorefrontCatalog } from '@/context/storefront-catalog';
import { useCart } from '@/context/cart-context';
import { ProductCard } from './product-card';
import { discountedUnit, money } from '@/lib/money';
export function InlineUpsell() {
    const { offer, products } = useStorefrontCatalog();
    const { deliveryType, standardDiscounts } = useCart();
    const { trackEvent } = useAnalytics();
    const ref = useRef<HTMLElement>(null), seen = useRef('');
    const [dismissed, setDismissed] = useState('');
    useEffect(() => {
        if (!offer || !ref.current)
            return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting) && seen.current !== offer.upsell.id) {
                if (trackEvent('upsell_offer_shown', { upsellId: offer.upsell.id }))
                    seen.current = offer.upsell.id;
            }
        }, { threshold: 0.25 });
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, [offer, trackEvent]);
    if (!offer || dismissed === offer.upsell.id)
        return null;
    const available = offer.products.filter(p => products.some(known => known.id === p.id)).slice(0, 3);
    if (!available.length)
        return null;
    return <section ref={ref} className="commerce-inline-offers" aria-label="Anbefalet til din ordre">
    <h3 className="font-semibold">{offer.upsell.upsellName || 'Lidt ekstra til din ordre'}</h3>
    {available.map(product => {
            const basePrice = money(deliveryType === 'delivery' ? product.priceDelivery ?? product.price : product.price);
            const price = discountedUnit(basePrice, offer.upsell.discountType, offer.upsell.discountValue);
            return <ProductCard key={product.id} product={{ ...product, price, basePrice } as typeof product} activeDiscounts={standardDiscounts} upsellId={offer.upsell.id}/>;
        })}
    <Button variant="link" className="px-0" onClick={() => { markUpsellHandled(offer.upsell.id); setDismissed(offer.upsell.id); trackEvent('upsell_rejected', { upsellId: offer.upsell.id }); }}>Skjul anbefaling</Button>
  </section>;
}
