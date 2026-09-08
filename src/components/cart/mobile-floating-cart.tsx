'use client';
import { useState } from 'react';
import { useCart } from '@/context/cart-context';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { CartContents, CartTotals, CartCheckoutButton } from './cart-contents';
import { formatPrice } from '@/lib/storefront-format';
export function MobileFloatingCart({ floating = true }: {
    floating?: boolean;
}) {
    const { itemCount, checkoutTotal, bagFee } = useCart();
    const [open, setOpen] = useState(false);
    if (!itemCount && floating)
        return null;
    return <>
    {floating && <div className="h-20 lg:hidden" aria-hidden="true"/>}
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="lg" className={floating ? 'fixed left-0 right-0 bottom-0 z-40 lg:hidden w-full h-[64.4px] rounded-none text-base font-bold' : 'font-bold'}>
          <span className="flex w-full items-center justify-between gap-4"><span>Se kurv · {itemCount}</span><span>{formatPrice(Math.max(0, checkoutTotal - bagFee))}</span></span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" data-commerce-panel="cart" className="flex flex-col p-0">
        <SheetHeader className="p-4"><SheetTitle>Din kurv · {itemCount} varer</SheetTitle><SheetDescription>Rediger dine varer, eller gå videre til kassen.</SheetDescription></SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto"><CartContents onEdit={() => setOpen(false)}/><CartTotals onBrowse={() => setOpen(false)}/></div>
        <div className="shrink-0 p-4 pt-2"><CartCheckoutButton /></div>
      </SheetContent>
    </Sheet>
  </>;
}
