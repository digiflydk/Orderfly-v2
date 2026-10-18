'use client';
import { useCart } from '@/context/cart-context';
import { CartContents, CartTotals, CartCheckoutButton } from './cart-contents';
import { itemCountLabel } from '@/lib/storefront-format';
export function DesktopCart() {
    const { itemCount } = useCart();
    return <aside className="rounded-xl border bg-background overflow-hidden" aria-label="Din kurv">
    <div className="p-4"><h2 className="text-xl font-bold">Din kurv</h2><p className="text-sm text-muted-foreground">{itemCountLabel(itemCount)}</p></div>
    <div className="max-h-[52vh] overflow-y-auto"><CartContents /></div>
    {!!itemCount && <><CartTotals /><div className="p-4 pt-0"><CartCheckoutButton /></div></>}
  </aside>;
}
