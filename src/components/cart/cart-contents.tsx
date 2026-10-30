'use client';
import Image from 'next/image';
import { useStorefrontV2 } from '@/context/storefront-v2-context';
import { Loader2, Minus, Plus, Trash2 } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useManagedDeliveryPrice } from '@/context/delivery-price-context';
import { useMenuCheckout } from '@/hooks/use-menu-checkout';
import { Button } from '@/components/ui/button';
import { safeImage } from '@/lib/images';
import { formatPrice } from '@/lib/storefront-format';
import { InlineUpsell } from '@/components/product/inline-upsell';
export function CartContents({ onEdit }: {
    onEdit?: () => void;
}) {
    const isV2 = useStorefrontV2();
    const { cartItems, removeFromCart, updateQuantity, setEditingItem } = useCart();
    if (!cartItems.length)
        return <p className="p-6 text-muted-foreground">Din kurv er tom. Find noget lækkert på menuen.</p>;
    return <div className="space-y-5 p-4" data-v2-cart-lines={isV2 || undefined}>
    {cartItems.map(item => {
            const toppings = item.toppings.reduce((sum, t) => sum + t.price, 0);
            return <article key={item.cartItemId} className="flex gap-3" data-cart-line={item.cartItemId}>
        <div className="relative h-16 w-16 shrink-0 v2-cart-image"><Image src={safeImage(item.imageUrl)} alt="" fill sizes={isV2 ? "88px" : "64px"} className="rounded-lg object-cover"/></div>
        <div className="min-w-0 flex-1 v2-cart-line-details">
          <h3 className="font-semibold text-sm">{item.productName}</h3>
          <p className="text-sm commerce-cart-total">{formatPrice((item.price + toppings) * item.quantity)} {item.basePrice > item.price && <del className="text-muted-foreground text-xs">{formatPrice((item.basePrice + toppings) * item.quantity)}</del>}</p>
          <p className="text-xs text-muted-foreground">{[...item.toppings.map(t => t.name), ...(item.comboSelections || []).flatMap(g => g.products.map(p => p.name))].join(', ') || (isV2 ? 'Standardopskrift' : '')}</p>
          <Button variant="link" className="px-0 h-11" onClick={() => { setEditingItem(item); onEdit?.(); }} aria-label={`Rediger ${item.productName}`}>Rediger</Button>
          <div className="flex items-center justify-between gap-1 v2-cart-controls">
            <div className="flex items-center gap-2 v2-cart-quantity">
              <Button variant="outline" size="icon" className="h-11 w-11" aria-label={`Fjern én ${item.productName}`} onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}><Minus className="size-4"/></Button>
              <span className="tabular-nums">{item.quantity}</span>
              <Button variant="outline" size="icon" className="h-11 w-11" aria-label={`Tilføj én ${item.productName}`} disabled={item.quantity >= 100} onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}><Plus className="size-4"/></Button>
            </div>
            <Button variant="ghost" size="icon" className="h-11 w-11 v2-cart-remove" aria-label={`Fjern ${item.productName}`} onClick={() => removeFromCart(item.cartItemId)}><Trash2 className="size-4"/></Button>
          </div>
        </div>
      </article>;
        })}
    <InlineUpsell />
  </div>;
}
export function CartTotals({ onBrowse }: {
    onBrowse?: () => void;
} = {}) {
    const { subtotal, itemDiscount, cartDiscount, voucherDiscount, checkoutTotal, bagFee, deliveryType, deliveryFee, freeDeliveryDiscountApplied, adminFee, location } = useCart();
    const managed = useManagedDeliveryPrice() && deliveryType === 'delivery';
    const minimum = deliveryType === 'delivery' ? Math.max(0, location?.minOrder || 0) : 0;
    const rows: [
        string,
        number
    ][] = [['Varer', subtotal]];
    if (itemDiscount > 0)
        rows.push(['Varerabat', -itemDiscount]);
    if (cartDiscount)
        rows.push([cartDiscount.name, -cartDiscount.amount]);
    if (voucherDiscount)
        rows.push([voucherDiscount.name, -voucherDiscount.amount]);
    if (deliveryType === 'delivery' && !managed)
        rows.push(['Levering', freeDeliveryDiscountApplied ? 0 : deliveryFee]);
    if (adminFee > 0)
        rows.push(['Servicegebyr', adminFee]);
    return <div className="border-t p-4 space-y-2 text-sm">
    {rows.map(([label, amount], i) => <div key={i} className="flex justify-between gap-3"><span>{label}</span><span className="commerce-cart-total">{formatPrice(amount)}</span></div>)}
    {managed && <div className="flex justify-between gap-3"><span>Levering</span><span>Beregnes i kassen</span></div>}
    <div className="flex justify-between gap-3 pt-3 border-t text-base font-bold"><span>Foreløbigt beløb</span><span className="commerce-cart-total">{managed ? 'Afventer leveringspris' : formatPrice(Math.max(0, checkoutTotal - bagFee))}</span></div>
    {minimum > subtotal && <div><p role="status">Tilføj varer for {formatPrice(minimum - subtotal)} for at nå minimumsbestillingen til levering på {formatPrice(minimum)} før rabatter.</p><Button variant="outline" className="mt-2" onClick={() => { onBrowse?.(); window.scrollTo({ top: 0, behavior: 'auto' }); }}>Find flere varer</Button></div>}
  </div>;
}
export function CartCheckoutButton() {
    const isV2 = useStorefrontV2();
    const { isPending, handleCheckoutClick } = useMenuCheckout();
    const { cartReady, itemCount, subtotal, deliveryType, location } = useCart();
    const belowMinimum = deliveryType === 'delivery' && subtotal < (location?.minOrder || 0);
    return <Button onClick={handleCheckoutClick} className="w-full h-[64.4px] font-bold" disabled={!cartReady || !itemCount || isPending || belowMinimum} aria-busy={isPending}>
    {isPending ? <><Loader2 className="mr-2 size-5 animate-spin"/>Åbner kassen</> : isV2 ? 'Gå til checkout' : 'Til kassen'}
  </Button>;
}
