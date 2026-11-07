'use client';
import { useCart } from '@/context/cart-context';
import { MobileFloatingCart } from './mobile-floating-cart';
import { itemCountLabel } from '@/lib/storefront-format';
export function DesktopCart() {
  const {itemCount} = useCart();
  return <aside className="rounded-xl border bg-background p-4 space-y-4" aria-label="Din kurv">
    <div><h2 className="text-xl font-bold">Din kurv</h2><p className="text-sm text-muted-foreground">{itemCountLabel(itemCount)}</p></div>
    {itemCount ? <MobileFloatingCart floating={false}/> : <p>Find noget lækkert på menuen.</p>}
  </aside>;
}
