'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/cart-context';
import { useAnalytics } from '@/context/analytics-context';
// Recommendations are inline. Navigation never waits for marketing services.
export function useMenuCheckout() {
    const { brand, location, cartReady, deliveryType, cartItems, checkoutTotal, itemCount } = useCart();
    const { trackEvent } = useAnalytics();
    const router = useRouter();
    const busy = useRef(false);
    const [isPending, setPending] = useState(false);
    const handleCheckoutClick = () => {
        if (busy.current || !cartReady || !brand || !location || !deliveryType || !cartItems.length)
            return;
        busy.current = true;
        setPending(true);
        try {
            trackEvent('start_checkout', { cartValue: checkoutTotal, itemsCount: itemCount, deliveryType });
        }
        catch { /* Optional telemetry. */ }
        router.push(`/${brand.slug}/${location.slug}/checkout`);
    };
    return { isPending, handleCheckoutClick };
}
