
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
    <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pb-[env(safe-area-inset-bottom)] bg-background border-t">
      <div>
        <CartSheet>
          <Button size="lg" className="w-full h-14 text-base rounded-none">
            <div className="flex items-center justify-between w-full px-2">
              <div className="flex items-center gap-3">
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
    </div>
  );
}
