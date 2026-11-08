'use client';
import { useEffect, useRef, useState } from 'react';
import { useStorefrontCatalog } from '@/context/storefront-catalog';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/cart-context';
import { useAnalytics } from '@/context/analytics-context';
import { browserStorefrontPath } from '@/hooks/use-storefront-path';
// Mobile offers precede the basket; desktop offers precede checkout.
export function useMenuCheckout({ offerUpsell = false }: { offerUpsell?: boolean } = {}) {
    const { openCart, cartOpening } = useStorefrontCatalog();
    const { brand, location, cartReady, deliveryType, cartItems, checkoutTotal, itemCount } = useCart();
    const { trackEvent } = useAnalytics();
    const router = useRouter();
    const busy = useRef(false);
    const [isPending, setPending] = useState(false);
    // Navigate after the last accepted upsell has committed, so checkout
    // measurement includes its quantity and price as well as the original cart.
    useEffect(() => {
        if (!isPending || busy.current || !brand || !location || !deliveryType) return;
        busy.current = true;
        try {
            trackEvent('start_checkout', { cartValue: checkoutTotal, itemsCount: itemCount, deliveryType });
        } catch { /* Optional telemetry. */ }
        router.push(browserStorefrontPath(brand.slug, location.slug, 'checkout'));
    }, [isPending, brand, location, deliveryType, checkoutTotal, itemCount, trackEvent, router]);
    const handleCheckoutClick = () => {
        if (busy.current || isPending || cartOpening || !cartReady || !brand || !location || !deliveryType || !cartItems.length)
            return;
        const proceed = () => setPending(true);
        if (offerUpsell) openCart(proceed, 'checkout');
        else proceed();
    };
    return { isPending: isPending || cartOpening, handleCheckoutClick };
}
