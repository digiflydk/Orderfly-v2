
'use client';

import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { CartSheet } from './cart-sheet';
import { Button } from '../ui/button';
import { SheetTrigger } from '../ui/sheet';

export function MobileFloatingCart() {
  const { itemCount, cartTotal } = useCart();

  if (itemCount === 0) {
    return null;
  }

  return (
    <CartSheet>
      {/* Spacer to prevent content from being hidden behind the sticky bar */}
      <div className="h-14 md:hidden" aria-hidden="true" />

      {/* The sticky, edge-to-edge container */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t pb-[max(env(safe-area-inset-bottom),0px)]">
        <SheetTrigger asChild>
          <Button
            size="lg"
            variant="default"
            className="w-full h-14 rounded-none flex justify-between items-center px-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground text-primary text-sm font-bold">
                {itemCount}
              </div>
              <span className="font-semibold">View cart</span>
            </div>
            <span className="font-bold">kr. {cartTotal.toFixed(2)}</span>
          </Button>
        </SheetTrigger>
      </div>
    </CartSheet>
  );
}
