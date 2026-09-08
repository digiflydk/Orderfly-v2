'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ComboMenu, ProductForMenu, Upsell } from '@/types';
import { useCart } from '@/context/cart-context';
import { optionalCheckoutValue } from '@/lib/optional-checkout';
import { isLockedItem } from '@/lib/cart-utils';
import { handledUpsells } from '@/lib/handled-upsells';
type Offer = {
    upsell: Pick<Upsell, 'id' | 'upsellName' | 'discountType' | 'discountValue'>;
    products: ProductForMenu[];
} | null;
const Catalog = createContext<{
    products: ProductForMenu[];
    combos: ComboMenu[];
    offer: Offer;
}>({ products: [], combos: [], offer: null });
export const useStorefrontCatalog = () => useContext(Catalog);
export function StorefrontCatalog({ products, combos, children }: {
    products: ProductForMenu[];
    combos: ComboMenu[];
    children: ReactNode;
}) {
    const { brand, location, deliveryType, cartItems, cartReady } = useCart();
    const [result, setResult] = useState<{
        key: string;
        offer: Offer;
    } | null>(null);
    const [tick, setTick] = useState(0);
    // One optional request per settled cart, shared by both responsive cart views.
    const key = JSON.stringify([brand?.id, location?.id, deliveryType, cartItems]);
    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(timer);
    }, []);
    useEffect(() => {
        let cancelled = false;
        if (!brand || !location || !deliveryType || !cartReady || !cartItems.length) {
            setResult(null);
            return;
        }
        const timer = setTimeout(() => {
            void optionalCheckoutValue(async () => {
                const response = await fetch('/api/public/upsell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(2000), body: JSON.stringify({
                        brandId: brand.id, locationId: location.id, deliveryType,
                        cartItems: cartItems.map(item => ({ id: item.id, categoryId: item.categoryId, itemType: item.itemType, tags: item.tags,
                            includedProductIds: item.comboSelections?.flatMap(g => g.products.map(p => p.id)) })),
                        cartTotal: cartItems.filter(item => !isLockedItem(item)).reduce((sum, item) => sum + (item.basePrice + item.toppings.reduce((n, t) => n + t.price, 0)) * item.quantity, 0),
                        excludedUpsellIds: handledUpsells(),
                    }) });
                if (!response.ok)
                    return null;
                const data = await response.json();
                if (!data || !Array.isArray(data.products) || typeof data.upsell?.id !== 'string' || typeof data.upsell?.upsellName !== 'string' || !['none', 'percentage', 'fixed_amount'].includes(data.upsell.discountType))
                    return null;
                if (data.upsell.discountType !== 'none' && (typeof data.upsell.discountValue !== 'number' || !Number.isFinite(data.upsell.discountValue) || data.upsell.discountValue <= 0))
                    return null;
                return { ...data, products: data.products.flatMap((p: {
                        id?: string;
                    }) => products.filter(known => known.id === p?.id)) } as Offer;
            }, null).then(offer => {
                if (!cancelled)
                    setResult({ key, offer });
            });
        }, 400);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [key, cartReady, tick]);
    const value = useMemo(() => ({ products, combos, offer: result?.key === key ? result.offer : null }), [products, combos, result, key]);
    return <Catalog.Provider value={value}>{children}</Catalog.Provider>;
}
