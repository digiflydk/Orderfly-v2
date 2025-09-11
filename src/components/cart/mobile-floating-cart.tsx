
'use client';

import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { Button } from '@/components/ui/button';
import { CartSheet } from './cart-sheet';

export function MobileFloatingCart() {
  const { itemCount, cartTotal } = useCart();

  if (itemCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 lg:hidden">
      <CartSheet>
          <Button size="lg" className="rounded-full shadow-lg h-16 text-base px-6">
            <div className="flex items-center justify-between w-full gap-4">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground text-primary text-sm font-bold">
                  {itemCount}
                </div>
                <span className="font-semibold">View cart</span>
              </div>
              <span className="font-bold">kr. {cartTotal.toFixed(2)}</span>
            </div>
          </Button>
      </CartSheet>
    </div>
  );
}
