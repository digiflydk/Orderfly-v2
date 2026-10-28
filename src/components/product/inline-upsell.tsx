'use client';
import { useEffect, useRef, useState } from 'react';
import { useAnalytics } from '@/context/analytics-context';
import { handledUpsells, markUpsellHandled } from '@/lib/handled-upsells';
import { Button } from '@/components/ui/button';
import { useStorefrontCatalog } from '@/context/storefront-catalog';
import { useCart } from '@/context/cart-context';
import { ProductCard } from './product-card';
import { discountedUnit, money } from '@/lib/money';
import { relevantUpsellProducts } from '@/lib/relevant-upsell-products';
export function InlineUpsell() {
    const { offer, products } = useStorefrontCatalog();
    const { deliveryType, standardDiscounts, cartItems, location } = useCart();
    const { trackEvent } = useAnalytics();
    const ref = useRef<HTMLElement>(null), seen = useRef(new Set<string>());
    const [dismissed, setDismissed] = useState<string[]>([]);
    const interactionIds = useRef(new Map<string, string>());
    const offerId = offer?.upsell.id ? `${location?.id || ''}/${offer.upsell.id}` : '';
    if (offerId && !interactionIds.current.has(offerId)) {
        interactionIds.current.set(offerId, typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `upsell-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    }
    const interactionId = interactionIds.current.get(offerId);
    const available = offer ? relevantUpsellProducts(offer.products, products, cartItems) : [];
    const hidden = !offer || dismissed.includes(offer.upsell.id) || !available.length;
    useEffect(() => {
        const sync = () => setDismissed(handledUpsells());
        sync(); window.addEventListener('orderfly:upsell-handled', sync);
        return () => window.removeEventListener('orderfly:upsell-handled', sync);
    }, []);
    useEffect(() => {
        if (hidden || !offer || !ref.current)
            return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting) && !seen.current.has(offerId)) {
                if (trackEvent('upsell_offer_shown', { upsellId: offer.upsell.id, interactionId, locationId: location?.id }))
                    seen.current.add(offerId);
            }
        }, { threshold: 0.25 });
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, [offer, offerId, hidden, interactionId, location?.id, trackEvent]);
    if (hidden || !offer)
        return null;
    return <section ref={ref} className="commerce-inline-offers" aria-label="Anbefalet til din ordre">
    <h3 className="font-semibold">{offer.upsell.upsellName || 'Lidt ekstra til din ordre'}</h3>
    {available.map(product => {
            const basePrice = money(deliveryType === 'delivery' ? product.priceDelivery ?? product.price : product.price);
            const price = discountedUnit(basePrice, offer.upsell.discountType, offer.upsell.discountValue);
            return <ProductCard key={product.id} product={{ ...product, price, basePrice } as typeof product} activeDiscounts={standardDiscounts} upsellId={offer.upsell.id} upsellInteractionId={interactionId} compact/>;
        })}
    <Button variant="link" className="px-0 min-h-11" onClick={() => { markUpsellHandled(offer.upsell.id); setDismissed(ids => [...ids, offer.upsell.id]); trackEvent('upsell_rejected', { upsellId: offer.upsell.id, interactionId, locationId: location?.id }); }}>Skjul anbefaling</Button>
  </section>;
}
