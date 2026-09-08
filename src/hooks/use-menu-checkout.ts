'use client';

import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/cart-context';
import { useAnalytics } from '@/context/analytics-context';
import { getActiveUpsellForCart } from '@/app/superadmin/upsells/actions';
import { optionalCheckoutValue } from '@/lib/optional-checkout';
import { handledUpsells, markUpsellHandled } from '@/lib/handled-upsells';
import { isLockedItem } from '@/lib/cart-utils';

// All menu cart entry points use the same optional read and single-flight guard.
export function useMenuCheckout() {
  const { brand, location, deliveryType, cartItems, checkoutTotal, itemCount } = useCart();
  const { trackEvent } = useAnalytics();
  const router = useRouter();
  const busy = useRef(false), mounted = useRef(true), navigated = useRef(false);
  const [isPending, setPending] = useState(false);
  const [isUpsellDialogOpen, setIsUpsellDialogOpen] = useState(false);
  const [activeUpsell, setActiveUpsell] = useState<Awaited<ReturnType<typeof getActiveUpsellForCart>>>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const proceedToCheckout = () => {
    if (!brand || !location || !mounted.current || navigated.current) return;
    navigated.current = true;
    busy.current = true;
    setPending(true);
    setIsUpsellDialogOpen(false);
    router.push(`/${brand.slug}/${location.slug}/checkout`);
  };
  const handleCheckoutClick = async () => {
    if (busy.current || isUpsellDialogOpen || !brand || !location || !deliveryType || !cartItems.length) return;
    busy.current = true;
    setPending(true);
    try { trackEvent('start_checkout', { cartValue: checkoutTotal, itemsCount: itemCount, deliveryType }); } catch { /* Optional telemetry. */ }
    try {
      const offer = await optionalCheckoutValue(() => getActiveUpsellForCart({
        brandId: brand.id, locationId: location.id, deliveryType,
        cartItems: cartItems.map(item => ({ id: item.id, categoryId: item.categoryId, itemType: item.itemType, tags: item.tags })),
        cartTotal: cartItems.filter(item => !isLockedItem(item)).reduce((sum, item) =>
          sum + (item.basePrice + item.toppings.reduce((total, topping) => total + topping.price, 0)) * item.quantity, 0),
        excludedUpsellIds: handledUpsells(),
      }), null);
      if (!mounted.current) return;
      if (offer) {
        markUpsellHandled(offer.upsell.id);
        setActiveUpsell(offer);
        setIsUpsellDialogOpen(true);
      } else proceedToCheckout();
    } finally {
      if (mounted.current && !navigated.current) { busy.current = false; setPending(false); }
    }
  };
  return { isPending, activeUpsell, isUpsellDialogOpen, setIsUpsellDialogOpen, proceedToCheckout, handleCheckoutClick };
}
