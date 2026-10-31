'use client';
import { useStorefrontV2 } from '@/context/storefront-v2-context';
import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/context/cart-context';
import { ShoppingBag, Plus, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { CartContents, CartTotals, CartCheckoutButton } from './cart-contents';
import { formatPrice, itemCountLabel } from '@/lib/storefront-format';
export function MobileFloatingCart({ floating = true, compact = false }: {
    floating?: boolean;
    compact?: boolean;
}) {
    const isV2 = useStorefrontV2();
    const { itemCount, checkoutTotal, bagFee, editingItem, deliveryType, location } = useCart();
    const [open, setOpen] = useState(false);
    const returnAfterEdit = useRef(false);
    useEffect(() => {
        if (returnAfterEdit.current && !editingItem) {
            returnAfterEdit.current = false;
            setOpen(true);
        }
    }, [editingItem]);
    if (!itemCount && floating)
        return null;
    return <>
    {floating && <div data-v2-cart-clearance={isV2 || undefined} className="h-20 lg:hidden" aria-hidden="true"/>}
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button data-v2-cart-bar={isV2 && floating || undefined} size="lg" className={floating ? 'fixed left-0 right-0 bottom-0 z-40 lg:hidden w-full h-[64.4px] rounded-none text-base font-bold' : 'font-bold min-h-11'}>
          <span className="flex w-full items-center justify-between gap-3">{compact && <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden="true" />}<span>Se kurv · {itemCount}</span>{!compact && <span>{formatPrice(Math.max(0, checkoutTotal - bagFee))}</span>}</span>
        </Button>
      </SheetTrigger>
      <SheetContent data-storefront-version={isV2 ? '2' : undefined} side="bottom" data-commerce-panel="cart" className="flex flex-col p-0">
        {isV2 && <div className="v2-cart-brandbar"><Button variant="ghost" size="icon" aria-label="Tilbage til menuen" onClick={() => setOpen(false)}><ArrowLeft className="size-5" /></Button><span>ESMERALDA</span></div>}
        <SheetHeader className="p-4 pr-14 shrink-0"><SheetTitle>{isV2 ? 'Din kurv' : `Din kurv · ${itemCountLabel(itemCount)}`}</SheetTitle><SheetDescription>{isV2 ? `${deliveryType === 'delivery' ? 'Levering' : 'Afhentning'}${location?.name ? ` · ${location.name}` : ''}` : 'Rediger dine varer, eller gå videre til kassen.'}</SheetDescription></SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto"><CartContents onEdit={() => { returnAfterEdit.current = true; setOpen(false); }}/>{isV2 && <div className="px-4 pb-5"><Button variant="outline" className="v2-browse-more w-full" onClick={() => setOpen(false)}><Plus className="mr-2 size-4" />Tilføj flere retter</Button></div>}<CartTotals onBrowse={() => setOpen(false)}/></div>
        <div className="shrink-0 border-t bg-background p-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"><CartCheckoutButton /></div>
      </SheetContent>
    </Sheet>
  </>;
}
