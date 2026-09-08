'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useCart } from '@/context/cart-context';
import { useStorefrontCatalog } from '@/context/storefront-catalog';
import { publicRead } from '@/lib/public-read';
import type { Topping, ToppingGroup } from '@/types';
import { Button } from '@/components/ui/button';
const ProductDialog = dynamic(() => import('../product/product-dialog').then(m => m.ProductDialog));
const ComboBuilderDialog = dynamic(() => import('../product/combo-builder-dialog').then(m => m.ComboBuilderDialog));
export function CartEditor() {
    const { editingItem, setEditingItem, location, deliveryType } = useCart();
    const { products, combos } = useStorefrontCatalog();
    const [options, setOptions] = useState<{
        key: string;
        toppings: Topping[];
        groups: ToppingGroup[];
    } | null>(null);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const key = `${editingItem?.cartItemId}/${location?.id}/${deliveryType}`;
    const product = products.find(p => p.id === editingItem?.id);
    const combo = combos.find(c => c.id === editingItem?.id);
    useEffect(() => {
        let cancelled = false;
        setError('');
        if (!editingItem || !location)
            return;
        if (editingItem.itemType === 'combo') {
            if (!combo)
                setError('Denne menu er ikke længere tilgængelig. Fjern den fra kurven og vælg en anden.');
            return;
        }
        if (!product) {
            setError('Denne vare er ikke længere tilgængelig. Fjern den fra kurven og vælg en anden.');
            return;
        }
        const read = product.toppingGroupIds?.length
            ? publicRead<{
                toppings: Topping[];
                groups: ToppingGroup[];
            }>(`/api/public/product-options?${new URLSearchParams({ brandId: product.brandId, locationId: location.id })}`)
            : Promise.resolve({ toppings: [], groups: [] });
        void read.then(data => {
            if (!Array.isArray(data.groups) || !Array.isArray(data.toppings))
                throw new Error('Invalid options response');
            if (!cancelled)
                setOptions({ ...data, key });
        }).catch(() => {
            if (!cancelled)
                setError('Tilvalg kunne ikke indlæses. Prøv igen.');
        });
        return () => { cancelled = true; };
    }, [key, retry, product, combo]);
    if (!editingItem)
        return null;
    const close = (open: boolean) => {
        if (!open)
            setEditingItem(null);
    };
    if (error)
        return <div role="alert" className="fixed bottom-24 left-4 right-4 z-50 rounded-lg bg-background border p-4 shadow-lg">{error}<Button variant="outline" onClick={() => setRetry(n => n + 1)}>Prøv igen</Button><Button variant="ghost" onClick={() => close(false)}>Luk</Button></div>;
    if (editingItem.itemType === 'combo' && combo)
        return <ComboBuilderDialog key={key} combo={combo} brandProducts={products} initialItem={editingItem} isOpen setIsOpen={close}/>;
    if (product && options?.key === key)
        return <ProductDialog key={key} product={{ ...product, price: editingItem.price, basePrice: editingItem.basePrice } as typeof product} allToppings={options.toppings} allToppingGroups={options.groups} initialItem={editingItem} isOpen setIsOpen={close}/>;
    return <div role="status" className="fixed bottom-24 left-4 z-50 rounded-lg border bg-background p-3">Åbner tilvalg…</div>;
}
