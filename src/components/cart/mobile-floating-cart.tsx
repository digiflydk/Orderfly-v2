
'use client';

import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { CartSheet } from './cart-sheet';
import { Button } from '../ui/button';

export function MobileFloatingCart() {
  const { itemCount, cartTotal } = useCart();

  if (itemCount === 0) {
    return null;
  }

  return (
    // This wrapper is now just for the CartSheet logic, not for styling the button directly.
    <CartSheet>
      <div
        className="
          fixed left-0 right-0 bottom-0 z-50 md:hidden
          pb-[max(env(safe-area-inset-bottom),0px)]
        "
      >
        {/* The CartSheet trigger is the button itself. */}
        <Button
          asChild
          size="lg"
          className="w-full h-14 bg-primary text-primary-foreground font-bold uppercase text-base rounded-none"
        >
          <div className="flex w-full justify-between items-center px-4">
            <div className="flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground text-primary text-sm font-bold">
                {itemCount}
              </div>
              <span className="font-semibold">View cart</span>
            </div>
            <span className="font-bold">kr. {cartTotal.toFixed(2)}</span>
          </div>
        </Button>
      </div>
    </CartSheet>
  );
}
